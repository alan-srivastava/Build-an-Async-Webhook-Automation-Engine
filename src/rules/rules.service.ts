import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rule, RuleDocument } from './schemas/rule.schema';
import { CreateRuleDto } from './dto/create-rule.dto';

@Injectable()
export class RulesService {
  constructor(@InjectModel(Rule.name) private ruleModel: Model<RuleDocument>) {}

  create(tenantId: Types.ObjectId, dto: CreateRuleDto) {
    return this.ruleModel.create({ ...dto, tenantId });
  }

  findAllForTenant(tenantId: Types.ObjectId) {
    return this.ruleModel.find({ tenantId }).sort({ createdAt: -1 }).lean();
  }

  // Used by the queue processor - only ever queried scoped to one tenant,
  // one source, one event type, and active=true.
  findMatchingCandidates(
    tenantId: Types.ObjectId,
    source: string,
    eventType: string,
  ) {
    return this.ruleModel.find({ tenantId, source, eventType, active: true });
  }
}
