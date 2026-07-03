import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rule, RuleSchema } from './schemas/rule.schema';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Rule.name, schema: RuleSchema }]),
    TenantsModule,
  ],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
