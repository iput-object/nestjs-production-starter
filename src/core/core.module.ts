import { Module } from '@nestjs/common';
import { AuditModule } from '@/core/audit/audit.module';
import { AuthModule } from '@/core/auth/auth.module';
import { FcmTokenModule } from '@/core/fcm-token/fcm-token.module';
import { FilesModule } from '@/core/files/files.module';
import { HealthModule } from '@/core/health/health.module';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    FcmTokenModule,
    FilesModule,
    HealthModule,
  ],
})
export class CoreModule {}
