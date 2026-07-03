import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { TenantDocument } from '../tenants/schemas/tenant.schema';
import { WebhookEvent, WebhookEventDocument } from './schemas/webhook-event.schema';

// Read-only, tenant-scoped view of ingested events for the UI's "Events" tab.
@Controller('events')
@UseGuards(TenantGuard)
export class EventsController {
  constructor(
    @InjectModel(WebhookEvent.name)
    private eventModel: Model<WebhookEventDocument>,
  ) {}

  @Get()
  findAll(@CurrentTenant() tenant: TenantDocument) {
    return this.eventModel
      .find({ tenantId: tenant._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }
}
