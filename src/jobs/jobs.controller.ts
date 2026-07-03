import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { TenantDocument } from '../tenants/schemas/tenant.schema';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(TenantGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  findAll(@CurrentTenant() tenant: TenantDocument) {
    return this.jobsService.findAllForTenant(tenant._id as any);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenant: TenantDocument, @Param('id') id: string) {
    return this.jobsService.findOneForTenant(tenant._id as any, id);
  }

  @Post(':id/replay')
  replay(@CurrentTenant() tenant: TenantDocument, @Param('id') id: string) {
    return this.jobsService.replay(tenant._id as any, id);
  }
}
