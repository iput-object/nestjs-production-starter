import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration, { Config } from '@/configs/environment.config';
import { ObservabilityModule } from '@/infrastructure/observability/observability.module';
import { PrismaModule } from '@/database/prisma.module';
import { CommonModule } from '@/common/common.module';
import { CoreModule } from '@/core/core.module';
import { RedisModule } from '@/infrastructure/redis/redis.module';
import { CryptoModule } from '@/common/crypto/crypto.module';
import { QueueModule } from '@/infrastructure/queue/queue.module';
import { MailerModule } from '@/infrastructure/mailer/mailer.module';
import { SmsModule } from '@/infrastructure/sms/sms.module';
import { StorageModule } from '@/infrastructure/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ObservabilityModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Config, true>) => {
        const config = configService.getOrThrow('app', { infer: true });
        return [
          {
            ttl: config.rateLimitTtl,
            limit: config.rateLimitLimit,
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
    CoreModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
