import { Injectable } from '@nestjs/common';
import {
  DevicePlatform as PrismaDevicePlatform,
  type FcmToken,
} from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';
import {
  DevicePlatform,
  type RegisterFcmTokenDto,
} from '@/core/fcm-token/dto/register-fcm-token.dto';
import locals from '@/locals';

const PLATFORM_TO_PRISMA: Record<DevicePlatform, PrismaDevicePlatform> = {
  [DevicePlatform.IOS]: PrismaDevicePlatform.IOS,
  [DevicePlatform.ANDROID]: PrismaDevicePlatform.ANDROID,
  [DevicePlatform.WEB]: PrismaDevicePlatform.WEB,
};

@Injectable()
export class RegisterFcmTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(payload: RegisterFcmTokenDto, userId: string) {
    const platform = PLATFORM_TO_PRISMA[payload.platform];
    const now = new Date();
    const data = {
      userId,
      token: payload.token,
      deviceId: payload.deviceId,
      platform,
      lastSeenAt: now,
    };

    const record = await this.prisma.$transaction(async (tx) => {
      const byToken = await tx.fcmToken.findUnique({
        where: { token: payload.token },
      });
      const byDevice = await tx.fcmToken.findUnique({
        where: {
          userId_deviceId: { userId, deviceId: payload.deviceId },
        },
      });

      if (byToken && byDevice && byToken.id === byDevice.id) {
        return tx.fcmToken.update({
          where: { id: byToken.id },
          data: { platform, lastSeenAt: now },
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

    return this.toResponse(record, payload.platform);
  }

  private toResponse(record: FcmToken, platform: DevicePlatform) {
    return {
      message: locals.fcm.token_synced,
      data: {
        id: record.id,
        userId: record.userId,
        token: record.token,
        deviceId: record.deviceId,
        platform,
        lastSeenAt: record.lastSeenAt.toISOString(),
      },
    };
  }
}
