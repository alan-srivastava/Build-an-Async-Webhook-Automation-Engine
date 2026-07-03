import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { TenantDocument } from '../tenants/schemas/tenant.schema';

@Controller('rules')
@UseGuards(TenantGuard)
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  create(@CurrentTenant() tenant: TenantDocument, @Body() dto: CreateRuleDto) {
    return this.rulesService.create(tenant._id as any, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantDocument) {
    return this.rulesService.findAllForTenant(tenant._id as any);
  }
}
