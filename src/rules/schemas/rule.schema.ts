import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RuleDocument = Rule & Document;

export type Operator = 'equals' | 'gt' | 'contains';

export class Condition {
  @Prop({ required: true })
  field: string; // dot-path into the payload, e.g. "total_price"

  @Prop({ required: true, enum: ['equals', 'gt', 'contains'] })
  operator: Operator;

  @Prop({ required: true, type: Object })
  value: any;
}

export class ActionConfig {
  @Prop({ required: true, enum: ['http_notify', 'crm_update'] })
  type: 'http_notify' | 'crm_update';

  @Prop({ type: Object, default: {} })
  config: Record<string, any>;
}

@Schema({ timestamps: true })
export class Rule {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ type: [Object], default: [] })
  conditions: Condition[];

  @Prop({ type: [Object], default: [] })
  actions: ActionConfig[];

  @Prop({ default: true })
  active: boolean;
}

export const RuleSchema = SchemaFactory.createForClass(Rule);
RuleSchema.index({ tenantId: 1, source: 1, eventType: 1, active: 1 });
