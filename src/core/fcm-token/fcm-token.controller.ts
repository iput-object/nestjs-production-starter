import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { FcmTokenService } from '@/core/fcm-token/fcm-token.service';
import { RegisterFcmTokenDto } from '@/core/fcm-token/dto/register-fcm-token.dto';
import { RemoveFcmTokenDto } from '@/core/fcm-token/dto/remove-fcm-token.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { TokenType } from '@/core/auth/decorators/token-type.decorator';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';

@Controller({ path: 'fcm-tokens', version: '1' })
@UseGuards(JwtAuthGuard)
@TokenType('access')
export class FcmTokenController {
  constructor(private readonly fcmTokenService: FcmTokenService) {}

  /** Register an FCM device token */
  @Post()
  @ApiOperation({ summary: 'Register an FCM device token' })
  register(
    @CurrentUser() user: JwtPayload,
    @Body() payload: RegisterFcmTokenDto,
  ) {
    return this.fcmTokenService.registerToken(payload, user.sub);
  }

  /** Remove an FCM device token */
  @Delete()
  @ApiOperation({ summary: 'Remove an FCM device token' })
  remove(@Body() payload: RemoveFcmTokenDto) {
    return this.fcmTokenService.removeToken(payload);
  }
}
