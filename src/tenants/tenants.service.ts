import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './schemas/tenant.schema';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  findAll() {
    return this.tenantModel.find().select('slug name').lean();
  }

  findBySlug(slug: string) {
    return this.tenantModel.findOne({ slug }).lean();
  }

  async upsert(slug: string, name: string, webhookSecret: string) {
    return this.tenantModel.findOneAndUpdate(
      { slug },
      { slug, name, webhookSecret },
      { upsert: true, new: true },
    );
  }
}
