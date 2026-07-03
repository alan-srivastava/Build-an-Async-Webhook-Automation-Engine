import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { WEBHOOK_QUEUE } from '../queue/queue.module';
import { WebhookEvent, WebhookEventDocument } from '../webhooks/schemas/webhook-event.schema';
import { JobRun, JobRunDocument } from './schemas/job-run.schema';
import { RulesService } from '../rules/rules.service';
import { ruleMatches } from '../rules/rule-evaluator';
import { ActionsService } from '../actions/actions.service';

interface JobData {
  webhookEventId: string;
}

/**
 * WorkerHost + @Processor gives us a real BullMQ worker: jobs are leased
 * with a lock, and if this process dies mid-`process()` the lock expires
 * and BullMQ's stalled-job check hands the SAME job (same jobId) to the
 * next worker instead of losing it or creating a duplicate. lockDuration /
 * stalledInterval are shortened here (vs BullMQ's 30s defaults) purely so
 * that recovery is visible within seconds during the demo recording.
 */
@Processor(WEBHOOK_QUEUE, {
  concurrency: 5,
  lockDuration: 10000,
  stalledInterval: 5000,
  maxStalledCount: 2,
})
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectModel(WebhookEvent.name)
    private eventModel: Model<WebhookEventDocument>,
    @InjectModel(JobRun.name) private jobRunModel: Model<JobRunDocument>,
    private rulesService: RulesService,
    private actionsService: ActionsService,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const { webhookEventId } = job.data;
    this.logger.log(`Processing job ${job.id} (attempt ${job.attemptsMade + 1}) for event ${webhookEventId}`);

    const event = await this.eventModel.findById(webhookEventId);
    if (!event) {
      // Nothing to retry towards - fail permanently rather than burn attempts.
      throw new Error(`WebhookEvent ${webhookEventId} not found`);
    }

    // Upsert a single JobRun per event so retries/replays update the same
    // observability record instead of spawning a new row every attempt.
    let jobRun = await this.jobRunModel.findOne({ webhookEventId: event._id });
    if (!jobRun) {
      jobRun = await this.jobRunModel.create({
        tenantId: event.tenantId,
        webhookEventId: event._id,
        source: event.source,
        eventType: event.eventType,
        status: 'active',
        attempts: 0,
        startedAt: new Date(),
      });
    }

    jobRun.status = 'active';
    jobRun.attempts += 1;
    if (!jobRun.startedAt) jobRun.startedAt = new Date();
    event.status = 'processing';
    await Promise.all([jobRun.save(), event.save()]);

    const rules = await this.rulesService.findMatchingCandidates(
      event.tenantId as any,
      event.source,
      event.eventType,
    );

    const ruleResults: any[] = [];
    let anyFailure = false;

    for (const rule of rules) {
      if (!ruleMatches(event.payload, rule.conditions as any)) continue;

      const actionResults: any[] = [];
      for (const actionCfg of rule.actions) {
        const outcome = await this.actionsService.execute(actionCfg.type, {
          tenantSlug: String(event.tenantId),
          eventType: event.eventType,
          source: event.source,
          payload: event.payload,
          config: actionCfg.config || {},
        });

        actionResults.push({
          type: actionCfg.type,
          status: outcome.status,
          error: outcome.error,
          output: outcome.output,
        });

        if (outcome.status === 'failed') anyFailure = true;
      }

      ruleResults.push({
        ruleId: rule._id,
        ruleName: rule.name,
        actions: actionResults,
      });
    }

    jobRun.ruleResults = ruleResults;

    if (anyFailure) {
      jobRun.status = 'failed';
      jobRun.error = 'One or more actions failed - see ruleResults for detail';
      event.status = 'failed';
      await Promise.all([jobRun.save(), event.save()]);
      // Throwing signals BullMQ to retry with backoff (up to defaultJobOptions.attempts).
      throw new Error(jobRun.error);
    }

    jobRun.status = 'completed';
    jobRun.finishedAt = new Date();
    jobRun.error = undefined;
    event.status = 'processed';
    await Promise.all([jobRun.save(), event.save()]);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<JobData>, err: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `Job ${job.id} permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
      );
      // Final attempt exhausted - make sure the persisted record reflects
      // "failed", not "active", even if the last process() throw raced the exit.
      await this.jobRunModel.updateOne(
        { webhookEventId: job.data.webhookEventId, status: { $ne: 'completed' } },
        { status: 'failed', error: err.message },
      );
      await this.eventModel.updateOne(
        { _id: job.data.webhookEventId },
        { status: 'failed' },
      );
    }
  }
}
