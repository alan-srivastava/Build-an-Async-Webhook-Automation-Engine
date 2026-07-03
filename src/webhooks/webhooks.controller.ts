import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { TenantsService } from '../tenants/tenants.service';
import { WebhookHeaders } from './dto/webhook-headers';

// NOT behind TenantGuard: this is the public-facing endpoint external
// platforms call. Tenant identity comes from the URL path (which platform
// dashboards are configured with per-tenant), and authenticity is proven
// by the HMAC signature - not by a client-settable header, which would let
// anyone impersonate any tenant.
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post(':tenantSlug/:source')
  @HttpCode(202)
  async receive(
    @Param('tenantSlug') tenantSlug: string,
    @Param('source') source: string,
    @Headers() headers: WebhookHeaders,
    @Body() body: Record<string, any>,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundException(`Unknown tenant: ${tenantSlug}`);
    }

    const externalEventId = headers['x-event-id'];
    const eventType = headers['x-event-type'];
    const signature = headers['x-webhook-signature'];

    // Reject malformed requests before they touch the database.
    if (!externalEventId || !eventType) {
      throw new BadRequestException(
        'Missing required headers: x-event-id, x-event-type',
      );
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body must be a JSON object');
    }

    // Reject spoofed requests before they touch the database.
    const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(body));
    const valid = this.webhooksService.verifySignature(
      rawBody,
      signature as string,
      tenant.webhookSecret,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // From here on the request is authenticated and well-formed - this is
    // the fast path: persist + enqueue, then return immediately. Rule
    // evaluation and action dispatch happen later, off the request thread.
    const result = await this.webhooksService.ingest(
      tenant as any,
      source,
      externalEventId,
      eventType,
      body,
      headers as any,
    );

    return result;
  }
}
