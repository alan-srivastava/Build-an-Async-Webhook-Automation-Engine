import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebhookEventDocument = WebhookEvent & Document;

export type EventStatus = 'received' | 'processing' | 'processed' | 'failed';

@Schema({ timestamps: true })
export class WebhookEvent {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  source: string; // e.g. "shopify", "stripe", "custom-crm"

  @Prop({ required: true })
  eventType: string; // e.g. "order.created"

  // The id the SOURCE platform assigns to this delivery (e.g. Shopify's
  // X-Shopify-Webhook-Id, Stripe's event.id). This, together with
  // tenantId + source, is what makes an event idempotent: a unique compound
  // index below guarantees we only ever store it once, no matter how many
  // times the platform retries the delivery.
  @Prop({ required: true })
  externalEventId: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ type: Object })
  headers: Record<string, any>;

  @Prop({ default: 'received', enum: ['received', 'processing', 'processed', 'failed'] })
  status: EventStatus;

  @Prop()
  receivedAt: Date;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

// The core idempotency guarantee: two deliveries of the same external event
// for the same tenant+source can never create two documents. Mongo enforces
// this atomically at the storage layer, so it holds even under concurrent
// requests - which a simple "check then insert" in application code would not.
WebhookEventSchema.index(
  { tenantId: 1, source: 1, externalEventId: 1 },
  { unique: true },
);
