import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Pulls the resolved tenant document off the request. It's placed there by
 * TenantGuard, which is the single point where tenant identity is resolved
 * and validated - controllers never trust a client-supplied tenant id blindly.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);
