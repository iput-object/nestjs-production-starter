import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT } from '@/infrastructure/redis/redis.constants';
import type { CachePort } from '@/infrastructure/redis/redis.types';
import {
  DevicePlatform,
  RegisterFcmTokenDto,
} from '@/core/fcm-token/dto/register-fcm-token.dto';
import { RemoveFcmTokenDto } from '@/core/fcm-token/dto/remove-fcm-token.dto';
import locals from '@/locals';

type StoredFcmToken = {
  userId: string;
  token: string;
  platform: DevicePlatform;
  deviceId?: string;
  createdAt: string;
};

@Injectable()
export class FcmTokenService {
  constructor(
    @Inject(CACHE_PORT)
    private readonly cache: CachePort,
  ) {}

  async registerToken(
    payload: RegisterFcmTokenDto,
    userId: string,
  ): Promise<{
    message: string;
    data: StoredFcmToken;
  }> {
    const record: StoredFcmToken = {
      userId,
      token: payload.token,
      platform: payload.platform,
      deviceId: payload.deviceId,
      createdAt: new Date().toISOString(),
    };

    await this.cache.set(this.buildTokenKey(payload.token), record);
    await this.cache.set(this.buildUserTokenKey(userId, payload.token), {
      token: payload.token,
    });

    return {
      message: locals.fcm.token_registered,
      data: record,
    };
  }

  async removeToken(payload: RemoveFcmTokenDto): Promise<{
    message: string;
    data: { removed: boolean };
  }> {
    const existing = await this.cache.get<StoredFcmToken>(
      this.buildTokenKey(payload.token),
    );

    if (!existing) {
      return {
        message: locals.fcm.token_not_found,
        data: { removed: false },
      };
    }

    await this.cache.del(this.buildTokenKey(payload.token));
    await this.cache.del(
      this.buildUserTokenKey(existing.userId, payload.token),
    );

    return {
      message: locals.fcm.token_removed,
      data: { removed: true },
    };
  }

  private buildTokenKey(token: string): string {
    return `fcm:token:${token}`;
  }

  private buildUserTokenKey(userId: string, token: string): string {
    return `fcm:user:${userId}:${token}`;
  }
}
