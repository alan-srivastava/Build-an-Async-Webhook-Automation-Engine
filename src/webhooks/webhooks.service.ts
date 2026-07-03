import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { WebhookEvent, WebhookEventDocument } from './schemas/webhook-event.schema';
import { TenantDocument } from '../tenants/schemas/tenant.schema';
import { WEBHOOK_QUEUE } from '../queue/queue.module';

export interface IngestResult {
  status: 'queued' | 'duplicate';
  eventId: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(WebhookEvent.name)
    private eventModel: Model<WebhookEventDocument>,
    @InjectQueue(WEBHOOK_QUEUE) private queue: Queue,
  ) {}

  /** Constant-time HMAC comparison so we don't leak timing info about the secret. */
  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    if (!signature) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const givenBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
  }

  async ingest(
    tenant: TenantDocument,
    source: string,
    externalEventId: string,
    eventType: string,
    payload: Record<string, any>,
    headers: Record<string, any>,
  ): Promise<IngestResult> {
    let event: WebhookEventDocument;

    try {
      // Atomic upsert keyed on the unique (tenant, source, externalEventId)
      // index. If this is a redelivery, Mongo throws E11000 below instead
      // of silently creating a second document - that's the exactly-once
      // guarantee, enforced at the database layer rather than with a
      // check-then-insert race in application code.
      event = await this.eventModel.create({
        tenantId: tenant._id,
        source,
        eventType,
        externalEventId,
        payload,
        headers,
        status: 'received',
        receivedAt: new Date(),
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        this.logger.log(
          `Duplicate delivery ignored: ${source}/${externalEventId}`,
        );
        const existing = await this.eventModel.findOne({
          tenantId: tenant._id,
          source,
          externalEventId,
        });
        return { status: 'duplicate', eventId: String(existing?._id) };
      }
      throw err;
    }

    // jobId = the event's own _id -> BullMQ itself will also refuse to
    // enqueue a second job with the same id, a second layer of dedup at
    // the queue level in case ingest() somehow runs twice for one document.
    await this.queue.add(
      'process-event',
      { webhookEventId: String(event._id) },
      { jobId: String(event._id) },
    );

    return { status: 'queued', eventId: String(event._id) };
  }

  findByIdForTenant(tenantId: Types.ObjectId, id: string) {
    return this.eventModel.findOne({ _id: id, tenantId });
  }
}
