# Debales Async Webhook Automation Engine

NestJS + BullMQ + Redis + MongoDB. Multi-tenant webhook ingestion, rule
evaluation, and action dispatch, with observability and replay.

## 1. Setup

### Option A - Docker (fastest)

```bash
cp .env.example .env
docker compose up --build
```

This starts Mongo, Redis, and the app on `http://localhost:3000`. Then seed
demo data (run once, from your host, with deps installed locally - see
Option B step 2 - or `docker compose exec app npm run seed`):

```bash
npm install
npm run seed
```

### Option B - Local Node

1. Start Mongo and Redis (or use docker for just those two):
   ```bash
   docker run -d -p 27017:27017 --name mongo mongo:7
   docker run -d -p 6379:6379 --name redis redis:7-alpine
   ```
2. Install deps and seed demo tenants/rules:
   ```bash
   cp .env.example .env
   npm install
   npm run seed
   ```
3. Run the app:
   ```bash
   npm run start:dev
   ```
4. Open `http://localhost:3000` for the admin UI (pick a tenant from the
   dropdown - "Acme Corp" or "Globex Inc", both created by the seed script).

## 2. Simulating a webhook

```bash
./scripts/send-webhook.sh 750        # order over $500 -> matches the demo rule
./scripts/send-duplicate.sh          # same event id sent twice -> second is deduped
```

Or by hand:

```bash
BODY='{"order_id":"ord_1","total_price":750,"currency":"USD","tags":["vip"]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac acme-dev-secret | sed 's/^.* //')

curl -i -X POST http://localhost:3000/webhooks/acme/shopify \
  -H "Content-Type: application/json" \
  -H "x-event-id: evt-1001" \
  -H "x-event-type: order.created" \
  -H "x-webhook-signature: $SIG" \
  -d "$BODY"
```

`acme-dev-secret` is the tenant's `webhookSecret`, seeded by `npm run seed`.

## 3. Triggering a failure and replaying it

The `crm_update` action has a configurable random failure rate
(`CRM_FAILURE_RATE` in `.env`, default `0.3`). Send a few webhooks - roughly
3 in 10 job runs will land in the "failed" status in the Jobs tab. Click
**Replay** on a failed row: it calls `POST /jobs/:id/replay`, which retries
the underlying BullMQ job and resets the JobRun to `queued`. Watch it flip
back to `completed` (or `failed` again, if the dice are unkind - replay it
again).

To force a guaranteed failure for the recording, temporarily set
`CRM_FAILURE_RATE=1` in `.env`, restart, send one webhook, then set it back
to something like `0.3` and restart again before showing a healthy run.

## 4. Data model

Four collections:

- **Tenant** - `slug`, `name`, `webhookSecret`. The `slug` is the tenant
  identity used both in the public ingestion URL (`/webhooks/:tenantSlug/:source`)
  and in the admin API's stub-auth header (`x-tenant-id`). One secret per
  tenant is enough to demonstrate signature verification without modeling
  per-source credentials, which the brief doesn't ask for.

- **WebhookEvent** - the raw, persisted delivery: `tenantId`, `source`,
  `eventType`, `externalEventId`, `payload`, `status`. A **unique compound
  index on `(tenantId, source, externalEventId)`** is the idempotency
  guarantee - Mongo enforces "this exact delivery exists at most once" at
  the storage layer, atomically, so it holds under concurrent redelivery,
  not just in the common case.

- **Rule** - `tenantId`, `source`, `eventType`, `conditions[]`, `actions[]`,
  `active`. Conditions are `{field, operator, value}` triples (`equals`,
  `gt`, `contains` - three operators, deliberately, per the brief).
  Actions are `{type, config}`. Storing rules as data rather than code is
  what lets a tenant "configure it once" through the API rather than us
  shipping code per tenant.

- **JobRun** - one document per `WebhookEvent`'s trip through the queue:
  `status`, `attempts`, `error`, and `ruleResults[]` (which rules matched,
  and the per-action outcome of each). This is the audit trail the "tenant
  needs visibility" requirement calls for, and it's also the *only* thing
  the UI's Jobs tab reads - it never needs to reconstruct state by
  re-evaluating rules.

**Gap I'm aware of and didn't close:** `JobRun` is keyed 1:1 with
`WebhookEvent` (found via `findOne` in the processor, not created fresh per
attempt). That means a replay overwrites `ruleResults` from the prior
attempt rather than keeping full attempt-by-attempt history. For this
assessment's scope that's an acceptable tradeoff (the UI always shows the
latest, most relevant state) - in production I'd split `ruleResults` into
a separate `attempts[]` subdocument array so history isn't lost.

## 5. Queue design

- **Queue**: one BullMQ queue (`webhook-events`) shared across all tenants.
  A job's data is just `{ webhookEventId }` - the job itself is a pointer,
  not a payload copy, so the queue stays lightweight and the source of
  truth is always Mongo.
- **jobId = the WebhookEvent's Mongo `_id`.** This is a second, independent
  idempotency layer: even if `ingest()` were somehow called twice for the
  same event (it shouldn't be, thanks to the unique index above), BullMQ
  itself refuses to create a second job with a jobId that already exists.
- **On failure**: `defaultJobOptions` gives each job 5 attempts with
  exponential backoff (2s, 4s, 8s...). The processor throws when any action
  in any matched rule fails, which BullMQ interprets as "retry me." After
  the final attempt, `@OnWorkerEvent('failed')` marks the `JobRun` and
  `WebhookEvent` as `failed` in Mongo so the UI reflects it even if the
  process were to crash immediately after the last attempt.
- **On worker crash**: BullMQ workers hold a lock on a job while processing
  it (`lockDuration`, set to 10s here instead of the 30s default purely so
  crash-recovery is visible quickly on camera). If the process dies mid-job,
  the lock expires, BullMQ's stalled-job checker (`stalledInterval`, 5s
  here) notices, and hands the *same* job back to the pool - not a new job,
  not a lost one. This is what "restart the worker, watch it recover"
  actually depends on, and it's a BullMQ primitive, not something we had
  to build.
- **What BullMQ gives us over a naive `setTimeout`/in-memory queue**:
  durability (jobs survive a process restart because they live in Redis,
  not in RAM), the lock/stall mechanism above, exponential backoff without
  us hand-rolling a retry loop, and concurrency control (`concurrency: 5`
  on the processor) without us managing a worker pool by hand.

## 6. Tenant isolation

Two enforcement points, both server-side:

1. **Ingestion** (`POST /webhooks/:tenantSlug/:source`): tenant comes from
   the URL, and the request is rejected with 401 before any DB write if the
   HMAC signature doesn't match that tenant's secret. A caller cannot
   "guess" their way into writing another tenant's data even with a valid
   payload, because they'd need that tenant's secret to produce a valid
   signature.
2. **All admin/read routes** (`/rules`, `/jobs`, `/events`): behind
   `TenantGuard`, which resolves the tenant from the `x-tenant-id` header
   server-side and attaches the resolved Mongo document (not the raw
   string) to the request. Every service method takes a `tenantId` and
   filters by it in the Mongo query itself (`{ tenantId, ... }`) - there is
   no code path where a controller trusts a tenant id supplied inside a
   request body or query string.

## 7. The scaling question

**Load**: one enterprise tenant, ~1,500 webhooks/day baseline (500k
orders/day × 3 webhooks/order), spiking to ~15,000/day during flash sales.
Worth converting to a rate: 15,000/day sustained-worst-case is ~10/minute
on average, but flash sales don't spread evenly - the real number that
matters is peak *events per second* during a sale's opening minutes, which
could plausibly be 50-200/sec for a few minutes, not the daily average.
Averages hide the thing that actually breaks systems.

**Where my current design breaks first**

1. **MongoDB writes on the ingestion path, specifically the unique-index
   check.** Every webhook does a synchronous `insert` against a unique
   compound index before returning 202. That index write is the single
   most expensive part of the hot path (cheaper than a queue push, but not
   free), and at high concurrency, unique-index contention on a single
   collection is where I'd expect the first slowdown - not a crash, but
   rising p99 latency on the "fast ack" the platform is waiting on.
   **How I'd measure it**: track p50/p99 latency on the ingestion endpoint
   specifically (not the whole API) under a synthetic load test (k6 or
   autocannon) ramping to the target rate, and watch MongoDB's
   `insert`/`index` operation latency in `mongostat` or Atlas's profiler in
   parallel. If ingestion p99 climbs while Mongo's own op latency stays
   flat, the bottleneck is elsewhere (Node event loop, network); if they
   move together, it's genuinely the write.

2. **A single BullMQ queue, single Redis instance, becomes a throughput
   ceiling next.** With `concurrency: 5` on one processor instance, worst
   case (all actions doing real I/O, ~200-400ms each per the `crm_update`
   simulation) that's roughly 12-25 jobs/sec per worker process. At 100+
   events/sec during a spike, the queue's `waiting` count will climb faster
   than jobs drain, and tenants start seeing multi-minute delays between
   "webhook received" and "action dispatched" - not data loss, but a
   real reliability regression against the "handled it reliably" bar the
   brief sets. **How I'd measure it**: BullMQ exposes queue depth
   (`getWaitingCount()`) and job duration natively - I'd export both to
   whatever metrics stack exists (Prometheus/Datadog) and alert on waiting
   count growing faster than it drains over a rolling window, rather than
   on a fixed threshold (a depth of 5,000 is fine if it clears in 10
   seconds, not fine if it's flat for 10 minutes).

3. **Third-order: the downstream integrations themselves** (the real CRM,
   the real Shopify API for any read-back). Those have their own rate
   limits, and a large tenant sending automation traffic at those APIs
   during a spike risks tripping the *downstream's* limits, not ours. This
   is invisible in load testing our own system and only shows up as a wall
   of `429`s in production, which is exactly what the `attempts` +
   exponential backoff on each job is already designed to absorb - so this
   one is closer to "already partially handled" than the first two.

**What I'd change, in order**

1. **Split the ingestion write into "durable but cheap" first.** Instead of
   a full Mongo document insert on every request, I'd insert into a
   narrower "dedup ledger" (just the unique key) or, more aggressively,
   push straight to a Redis `SET NX` for the dedup check (sub-millisecond,
   already the tool we're paying for) and let the BullMQ job itself persist
   the full document asynchronously. This trades "the DB write happens
   before ack" for "the dedup check happens before ack, the DB write
   happens moments later" - still exactly-once, still fast, but the
   expensive part moves off the request path. I'd do this first because
   it's the smallest change with the most direct effect on the metric that
   matters most to the platform sending us webhooks (ack latency).

2. **Horizontally scale workers, not the queue.** BullMQ workers are
   stateless consumers of one Redis-backed queue, so adding worker
   processes (more containers, same `concurrency: 5` each, or tune
   concurrency up per instance) is close to linear scaling for I/O-bound
   action dispatch, with no architecture change - this is the "add more
   workers" answer, but only *after* step 1, because more workers pulling
   from a queue that's still backed up on slow ingestion writes doesn't
   help; the bottleneck has to move before adding capacity behind it does
   anything.

3. **Only after both of those show up as insufficient in real metrics**,
   I'd consider per-tenant queue partitioning (a dedicated queue, or at
   minimum priority weighting, for large tenants) so one enterprise
   tenant's flash sale can't starve smaller tenants' job processing on the
   shared queue - this is the point where "add more workers" stops being
   the answer and the queue topology itself needs to change. I'd do this
   last and only with evidence, because it adds real operational
   complexity (more queues to monitor, rebalancing logic) that isn't
   justified until the simpler fixes are proven insufficient.

I did not include "add a message broker like Kafka" as a first move: BullMQ
on Redis already gives us durable, ordered-enough, retryable job processing
at the throughput this problem describes (low hundreds of events/sec at
worst). Reaching for Kafka before proving Redis/BullMQ is the actual
ceiling would be solving a problem we don't have yet at the cost of
operational complexity we would definitely have.

## 8. What I'd do next with more time

- Per-attempt history on `JobRun` (see the data model note above).
- A dead-letter view: jobs that exhausted all 5 attempts get a distinct
  "exhausted" state, separate from "failed but retrying," so a tenant can
  tell the difference between "still working on it" and "needs a human."
- Real auth (JWT) instead of the `x-tenant-id` stub header - explicitly out
  of scope per the brief, but the `TenantGuard` is already the single
  integration point where that would slot in without touching any
  controller or service.
