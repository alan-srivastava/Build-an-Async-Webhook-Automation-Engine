import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookEvent, WebhookEventSchema } from './schemas/webhook-event.schema';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { EventsController } from './events.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
    ]),
    TenantsModule,
    QueueModule,
  ],
  controllers: [WebhooksController, EventsController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
