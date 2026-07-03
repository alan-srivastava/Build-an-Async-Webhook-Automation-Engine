import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { JobRun, JobRunDocument } from './schemas/job-run.schema';
import { WEBHOOK_QUEUE } from '../queue/queue.module';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(JobRun.name) private jobRunModel: Model<JobRunDocument>,
    @InjectQueue(WEBHOOK_QUEUE) private queue: Queue,
  ) {}

  findAllForTenant(tenantId: Types.ObjectId) {
    return this.jobRunModel
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  async findOneForTenant(tenantId: Types.ObjectId, id: string) {
    const jobRun = await this.jobRunModel.findOne({ _id: id, tenantId });
    if (!jobRun) throw new NotFoundException('Job not found');
    return jobRun;
  }

  /**
   * Replay a failed job. Preference order:
   *  1. If the original BullMQ job still exists and is in the `failed`
   *     state, call job.retry() - this reuses the same jobId and gives us
   *     a clean, native "run it again" with a fresh attempt count.
   *  2. Otherwise (job was cleaned up, or is in some other terminal state),
   *     re-enqueue under a derived jobId so it can't collide with the
   *     original but is still traceable back to it.
   * Either way the JobRun document is reset to `queued` so the UI reflects
   * the replay immediately rather than showing stale "failed" state.
   */
  async replay(tenantId: Types.ObjectId, id: string) {
    const jobRun = await this.findOneForTenant(tenantId, id);
    const originalJobId = String(jobRun.webhookEventId);

    const existingJob = await this.queue.getJob(originalJobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'failed') {
        await existingJob.retry();
      } else {
        await this.queue.add(
          'process-event',
          { webhookEventId: originalJobId },
          { jobId: `${originalJobId}-replay-${Date.now()}` },
        );
      }
    } else {
      await this.queue.add(
        'process-event',
        { webhookEventId: originalJobId },
        { jobId: `${originalJobId}-replay-${Date.now()}` },
      );
    }

    jobRun.status = 'queued';
    jobRun.error = undefined;
    await jobRun.save();
    return jobRun;
  }
}
