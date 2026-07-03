import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobRunDocument = JobRun & Document;

export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';

export class ActionResult {
  @Prop({ required: true })
  type: string;

  @Prop({ required: true, enum: ['success', 'failed'] })
  status: 'success' | 'failed';

  @Prop()
  error?: string;

  @Prop({ type: Object })
  output?: Record<string, any>;
}

export class RuleResult {
  @Prop({ type: Types.ObjectId, ref: 'Rule' })
  ruleId: Types.ObjectId;

  @Prop()
  ruleName: string;

  @Prop({ type: [Object], default: [] })
  actions: ActionResult[];
}

// One JobRun document = one BullMQ job's lifecycle for one WebhookEvent.
// This is what the UI's "Jobs" table renders, and what "Replay" re-enqueues.
@Schema({ timestamps: true })
export class JobRun {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'WebhookEvent', index: true })
  webhookEventId: Types.ObjectId;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ default: 'queued', enum: ['queued', 'active', 'completed', 'failed'] })
  status: JobStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  error?: string;

  @Prop({ type: [Object], default: [] })
  ruleResults: RuleResult[];

  @Prop()
  startedAt?: Date;

  @Prop()
  finishedAt?: Date;
}

export const JobRunSchema = SchemaFactory.createForClass(JobRun);
JobRunSchema.index({ tenantId: 1, createdAt: -1 });
