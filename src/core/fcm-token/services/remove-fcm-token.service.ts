import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { RemoveFcmTokenResponseDto } from '@/core/fcm-token/dto/response/remove-fcm-token.response.dto';
import { FcmTokenRepository } from '@/core/fcm-token/repositories/fcm-token.repository';
import type { RemoveFcmTokenDto } from '@/core/fcm-token/dto/request/remove-fcm-token.dto';
import locals from '@/locals';

@Injectable()
export class RemoveFcmTokenService {
  constructor(private readonly fcmTokens: FcmTokenRepository) {}

  async execute(payload: RemoveFcmTokenDto, userId: string) {
    await this.fcmTokens.deleteOwnedToken(userId, payload.token);

    return {
      message: locals.fcm.token_removed,
      data: plainToInstance(
        RemoveFcmTokenResponseDto,
        { removed: true },
        { excludeExtraneousValues: true },
      ),
    };
  }
}
