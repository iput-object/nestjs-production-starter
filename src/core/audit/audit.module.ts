import { Global, Module } from '@nestjs/common';
import { AuditProcessor } from '@/core/audit/processors/audit.processor';
import { ActivityRepository } from '@/core/audit/repositories/activity.repository';
import { AuditBufferService } from '@/core/audit/services/audit-buffer.service';
import { AuditService } from '@/core/audit/services/audit.service';

@Global()
@Module({
  providers: [
    ActivityRepository,
    AuditBufferService,
    AuditService,
    AuditProcessor,
  ],
  exports: [ActivityRepository, AuditService],
})
export class AuditModule {}
