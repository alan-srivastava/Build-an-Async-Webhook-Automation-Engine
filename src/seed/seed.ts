import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TenantsService } from '../tenants/tenants.service';
import { RulesService } from '../rules/rules.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const tenantsService = app.get(TenantsService);
  const rulesService = app.get(RulesService);

  const acme = await tenantsService.upsert(
    'acme',
    'Acme Corp',
    'acme-dev-secret', // matches scripts/send-webhook.sh
  );

  const globex = await tenantsService.upsert(
    'globex',
    'Globex Inc',
    'globex-dev-secret',
  );

  // Rule 1: big-order alert (operator: gt) -> two actions, so a single
  // event can demonstrate both action types firing off one rule match.
  await rulesService.create(acme._id as any, {
    name: 'Notify sales on big Shopify orders',
    source: 'shopify',
    eventType: 'order.created',
    conditions: [{ field: 'total_price', operator: 'gt', value: 500 }],
    actions: [
      {
        type: 'http_notify',
        config: { message: 'High-value order received' },
      },
      { type: 'crm_update', config: { field: 'last_order_value' } },
    ],
    active: true,
  });

  // Rule 2: exact status match (operator: equals)
  await rulesService.create(acme._id as any, {
    name: 'Flag failed payments',
    source: 'stripe',
    eventType: 'payment.failed',
    conditions: [{ field: 'status', operator: 'equals', value: 'failed' }],
    actions: [
      { type: 'http_notify', config: { message: 'Payment failed - follow up' } },
    ],
    active: true,
  });

  // Rule 3: substring/array match (operator: contains) for the second tenant,
  // to also demonstrate that tenants' rule sets never see each other.
  await rulesService.create(globex._id as any, {
    name: 'Tag VIP customer orders',
    source: 'shopify',
    eventType: 'order.created',
    conditions: [{ field: 'tags', operator: 'contains', value: 'vip' }],
    actions: [{ type: 'crm_update', config: { field: 'vip_flag' } }],
    active: true,
  });

  // eslint-disable-next-line no-console
  console.log('Seeded tenants: acme (secret: acme-dev-secret), globex (secret: globex-dev-secret)');
  // eslint-disable-next-line no-console
  console.log('Seeded 3 rules across the two tenants.');

  await app.close();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
