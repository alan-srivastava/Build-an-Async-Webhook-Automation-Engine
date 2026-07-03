import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobRun, JobRunSchema } from './schemas/job-run.schema';
import { WebhookEvent, WebhookEventSchema } from '../webhooks/schemas/webhook-event.schema';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { WebhookProcessor } from './jobs.processor';
import { RulesModule } from '../rules/rules.module';
import { ActionsModule } from '../actions/actions.module';
import { TenantsModule } from '../tenants/tenants.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobRun.name, schema: JobRunSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
    ]),
    RulesModule,
    ActionsModule,
    TenantsModule,
    QueueModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, WebhookProcessor],
})
export class JobsModule {}
