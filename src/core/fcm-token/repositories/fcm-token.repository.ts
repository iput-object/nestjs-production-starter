import { Injectable } from '@nestjs/common';
import type { FcmToken } from '@prisma-client';
import type { DevicePlatformValue } from '@/core/fcm-token/constants/device-platform.constants';
import { PrismaService } from '@/database/prisma.service';

export interface SyncFcmTokenInput {
  userId: string;
  token: string;
  deviceId: string;
  platform: DevicePlatformValue;
  lastSessionId?: string | null;
}

@Injectable()
export class FcmTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByToken(token: string): Promise<FcmToken | null> {
    return this.prisma.fcmToken.findUnique({ where: { token } });
  }

  findByUserAndDevice(
    userId: string,
    deviceId: string,
  ): Promise<FcmToken | null> {
    return this.prisma.fcmToken.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
  }

  listForUser(userId: string): Promise<FcmToken[]> {
    return this.prisma.fcmToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Idempotent device sync:
   * - token owned elsewhere → reassign to this user/device
   * - same device, new token → replace token
   * - both collide as different rows → keep token row, drop device row
   */
  sync(input: SyncFcmTokenInput): Promise<FcmToken> {
    const now = new Date();
    const data = {
      userId: input.userId,
      token: input.token,
      deviceId: input.deviceId,
      platform: input.platform,
      lastSessionId: input.lastSessionId ?? null,
      lastSeenAt: now,
    };

    return this.prisma.$transaction(async (tx) => {
      const byToken = await tx.fcmToken.findUnique({
        where: { token: input.token },
      });
      const byDevice = await tx.fcmToken.findUnique({
        where: {
          userId_deviceId: {
            userId: input.userId,
            deviceId: input.deviceId,
          },
        },
      });

      if (byToken && byDevice && byToken.id === byDevice.id) {
        return tx.fcmToken.update({
          where: { id: byToken.id },
          data: {
            platform: input.platform,
            lastSessionId: data.lastSessionId,
            lastSeenAt: now,
          },
        });
      }

      if (byToken && byDevice && byToken.id !== byDevice.id) {
        await tx.fcmToken.delete({ where: { id: byDevice.id } });
        return tx.fcmToken.update({
          where: { id: byToken.id },
          data,
        });
      }

      if (byToken) {
        return tx.fcmToken.update({
          where: { id: byToken.id },
          data,
        });
      }

      if (byDevice) {
        return tx.fcmToken.update({
          where: { id: byDevice.id },
          data,
        });
      }

      return tx.fcmToken.create({ data });
    });
  }

  deleteOwnedToken(userId: string, token: string): Promise<{ count: number }> {
    return this.prisma.fcmToken.deleteMany({
      where: { userId, token },
    });
  }

  deleteAllForUser(userId: string): Promise<{ count: number }> {
    return this.prisma.fcmToken.deleteMany({ where: { userId } });
  }
}
