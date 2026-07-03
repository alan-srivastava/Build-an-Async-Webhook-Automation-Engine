import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';

/**
 * Stub auth: "login as tenant X" via an `x-tenant-id` header carrying the
 * tenant slug. There is no user/password flow (explicitly out of scope per
 * the brief), but tenant *isolation* is real: every controller that touches
 * tenant-owned data goes through this guard, and every query downstream is
 * filtered by the resolved tenant's ObjectId - never by a client-supplied
 * one. A client cannot see another tenant's data by editing a body/query
 * param, only by presenting a different tenant slug (i.e. "logging in" as
 * that tenant), which is the boundary this assessment asks us to model.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug = request.headers['x-tenant-id'];

    if (!slug || typeof slug !== 'string') {
      throw new UnauthorizedException(
        'Missing x-tenant-id header (stub auth: "login as tenant" first)',
      );
    }

    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) {
      throw new UnauthorizedException(`Unknown tenant: ${slug}`);
    }

    request.tenant = tenant;
    return true;
  }
}
