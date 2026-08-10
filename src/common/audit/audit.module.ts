import { Global, Module } from '@nestjs/common';
import { AuditProcessor } from '@/common/audit/processors/audit.processor';
import { ActivityRepository } from '@/common/audit/repositories/activity.repository';
import { AuditBufferService } from '@/common/audit/services/audit-buffer.service';
import { AuditService } from '@/common/audit/services/audit.service';

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
