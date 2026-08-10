import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { RegisterFcmTokenService } from '@/core/fcm-token/services/register-fcm-token.service';
import { RemoveFcmTokenService } from '@/core/fcm-token/services/remove-fcm-token.service';
import { RegisterFcmTokenDto } from '@/core/fcm-token/dto/register-fcm-token.dto';
import { RemoveFcmTokenDto } from '@/core/fcm-token/dto/remove-fcm-token.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { VerifiedGuard } from '@/core/auth/guards/verified.guard';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { TokenType } from '@/core/auth/decorators/token-type.decorator';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';

@Controller({ path: 'fcm-tokens', version: '1' })
@UseGuards(JwtAuthGuard, VerifiedGuard)
@TokenType('access')
export class FcmTokenController {
  constructor(
    private readonly registerFcmToken: RegisterFcmTokenService,
    private readonly removeFcmToken: RemoveFcmTokenService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Sync an FCM device token',
    description:
      'Idempotent upsert keyed by deviceId (and unique FCM token). Call after login, on app foreground, and whenever the FCM SDK rotates the token. Persist a stable deviceId per install.',
  })
  register(
    @CurrentUser() user: JwtPayload,
    @Body() payload: RegisterFcmTokenDto,
  ) {
    return this.registerFcmToken.execute(payload, user.sub);
  }

  @Delete()
  @ApiOperation({
    summary: 'Remove an FCM device token',
    description:
      'Best-effort unregister for the current user (e.g. on logout). Always returns removed=true; only deletes a token owned by the caller.',
  })
  remove(
    @CurrentUser() user: JwtPayload,
    @Body() payload: RemoveFcmTokenDto,
  ) {
    return this.removeFcmToken.execute(payload, user.sub);
  }
}
