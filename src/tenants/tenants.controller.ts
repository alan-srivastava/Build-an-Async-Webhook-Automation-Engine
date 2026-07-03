import { Controller, Get } from '@nestjs/common';
import { TenantsService } from './tenants.service';

// Deliberately NOT tenant-scoped: this powers the "login as tenant" stub
// selector in the UI, so it needs to list all tenants that exist.
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }
}
