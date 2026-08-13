import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '@/database/prisma.service';
import { DEVICE_PLATFORM_FROM_API } from '@/core/fcm-token/constants/device-platform.constants';
import { RegisterFcmTokenResponseDto } from '@/core/fcm-token/dto/response/register-fcm-token.response.dto';
import type { RegisterFcmTokenDto } from '@/core/fcm-token/dto/request/register-fcm-token.dto';
import locals from '@/locals';

@Injectable()
export class RegisterFcmTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(payload: RegisterFcmTokenDto, userId: string) {
    const platform = DEVICE_PLATFORM_FROM_API[payload.platform];
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

    return {
      message: locals.fcm.token_synced,
      data: plainToInstance(RegisterFcmTokenResponseDto, record, {
        excludeExtraneousValues: true,
      }),
    };
  }
}
