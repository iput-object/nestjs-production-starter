import { Injectable } from '@nestjs/common';
import { FcmTokenRepository } from '@/core/fcm-token/repositories/fcm-token.repository';
import type { RemoveFcmTokenDto } from '@/core/fcm-token/dto/remove-fcm-token.dto';
import locals from '@/locals';

@Injectable()
export class RemoveFcmTokenService {
  constructor(private readonly fcmTokens: FcmTokenRepository) {}

  async execute(payload: RemoveFcmTokenDto, userId: string) {
    await this.fcmTokens.deleteOwnedToken(userId, payload.token);

    return {
      message: locals.fcm.token_removed,
      data: { removed: true },
    };
  }
}
