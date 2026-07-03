import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, unique: true })
  slug: string; // e.g. "acme-corp" - used as the tenant identifier in headers

  @Prop({ required: true })
  name: string;

  // Shared secret used to verify HMAC signatures on incoming webhooks for
  // this tenant. In a real system this would be per-source, but one secret
  // per tenant is enough to demonstrate signature verification.
  @Prop({ required: true })
  webhookSecret: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
