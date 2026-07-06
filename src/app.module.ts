import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration, { Config } from '@/configs/environment.config';
import { ObservabilityModule } from '@/infrastructure/observability/observability.module';
import { PrismaModule } from '@/database/prisma.module';
import { CommonModule } from '@/common/common.module';
import { RedisModule } from '@/infrastructure/redis/redis.module';
import { CryptoModule } from '@/common/crypto/crypto.module';
import { QueueModule } from '@/infrastructure/queue/queue.module';
import { MailerModule } from '@/infrastructure/mailer/mailer.module';
import { SmsModule } from '@/infrastructure/sms/sms.module';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { FcmTokenModule } from '@/core/fcm-token/fcm-token.module';
import { HealthModule } from '@/core/health/health.module';
import { AuthModule } from '@/core/auth/auth.module';
import { FilesModule } from '@/core/files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ObservabilityModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Config>) => {
        const config = configService.get('app');
        return [
          {
            ttl: config?.rateLimitTtl ?? 60,
            limit: config?.rateLimitLimit ?? 100,
          },
        ];
      },
    }),
    CommonModule,
    PrismaModule,
    RedisModule,
    CryptoModule,
    QueueModule,
    MailerModule,
    SmsModule,
    StorageModule,
    AuthModule,
    FcmTokenModule,
    FilesModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
