/**
 * Contract external platforms must follow when calling
 * POST /webhooks/:tenantSlug/:source
 *
 *   x-event-id:        the platform's own id for this delivery (used for
 *                       dedup - Shopify/Stripe/etc all provide one)
 *   x-event-type:      e.g. "order.created", "payment.failed"
 *   x-webhook-signature: hex HMAC-SHA256 of the raw request body, keyed
 *                       with the tenant's webhookSecret
 */
export interface WebhookHeaders {
  'x-event-id'?: string;
  'x-event-type'?: string;
  'x-webhook-signature'?: string;
}
