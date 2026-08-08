import { Module } from '@nestjs/common';
import { FcmTokenController } from '@/core/fcm-token/fcm-token.controller';
import { FcmTokenRepository } from '@/core/fcm-token/repositories/fcm-token.repository';
import { RegisterFcmTokenService } from '@/core/fcm-token/services/register-fcm-token.service';
import { RemoveFcmTokenService } from '@/core/fcm-token/services/remove-fcm-token.service';

@Module({
  controllers: [FcmTokenController],
  providers: [
    FcmTokenRepository,
    RegisterFcmTokenService,
    RemoveFcmTokenService,
  ],
  exports: [FcmTokenRepository],
})
export class FcmTokenModule {}
