import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ActionContext {
  tenantSlug: string;
  eventType: string;
  source: string;
  payload: Record<string, any>;
  config: Record<string, any>;
}

export interface ActionOutcome {
  status: 'success' | 'failed';
  error?: string;
  output?: Record<string, any>;
}

/**
 * Two action types, on purpose (per the brief: "three operators beats ten").
 * Each is a small, honest simulation of a real downstream integration:
 *
 *  - http_notify: an actual outbound HTTP POST to a URL you control
 *    (point NOTIFY_WEBHOOK_URL at https://webhook.site during the demo).
 *    Fails "for real" if the endpoint is unreachable or returns non-2xx.
 *
 *  - crm_update: no real CRM exists here, so this simulates one with a
 *    configurable random failure rate (CRM_FAILURE_RATE) - this is what
 *    makes "trigger a failure, show it, replay it" reproducible on demand
 *    instead of hoping a flaky third party cooperates during the recording.
 */
@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  constructor(private readonly config: ConfigService) {}

  async execute(type: string, ctx: ActionContext): Promise<ActionOutcome> {
    switch (type) {
      case 'http_notify':
        return this.httpNotify(ctx);
      case 'crm_update':
        return this.crmUpdate(ctx);
      default:
        return { status: 'failed', error: `Unknown action type: ${type}` };
    }
  }

  private async httpNotify(ctx: ActionContext): Promise<ActionOutcome> {
    const url =
      ctx.config.url || this.config.get<string>('NOTIFY_WEBHOOK_URL');

    if (!url) {
      return { status: 'failed', error: 'No notify URL configured' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: ctx.tenantSlug,
          source: ctx.source,
          eventType: ctx.eventType,
          message: ctx.config.message ?? 'Automation rule triggered',
          payload: ctx.payload,
        }),
        // Don't let a hanging endpoint stall the worker forever.
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return {
          status: 'failed',
          error: `Notify endpoint returned HTTP ${res.status}`,
        };
      }

      return { status: 'success', output: { httpStatus: res.status } };
    } catch (err: any) {
      this.logger.warn(`http_notify failed: ${err.message}`);
      return { status: 'failed', error: err.message };
    }
  }

  private async crmUpdate(ctx: ActionContext): Promise<ActionOutcome> {
    const failureRate = parseFloat(
      this.config.get<string>('CRM_FAILURE_RATE', '0'),
    );

    // Simulate network/processing latency of a real CRM call.
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

    if (Math.random() < failureRate) {
      return {
        status: 'failed',
        error: 'CRM upstream timeout (simulated downstream failure)',
      };
    }

    return {
      status: 'success',
      output: {
        crmRecordId: `crm_${Math.random().toString(36).slice(2, 10)}`,
        updatedField: ctx.config.field ?? 'status',
      },
    };
  }
}
