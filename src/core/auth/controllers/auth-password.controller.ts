import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { SudoGuard } from '@/core/auth/guards/sudo.guard';
import locals from '@/locals';
import { ChangePasswordDto } from '@/core/auth/dto/request/change-password.dto';
import {
  ForgotPasswordDto,
  ResetPasswordByOtpDto,
  ResetPasswordDto,
  SendPasswordResetOtpDto,
} from '@/core/auth/dto/request/reset-password.dto';
import { SetPasswordDto } from '@/core/auth/dto/request/set-password.dto';
import { ForgotPasswordResponseDto } from '@/core/auth/dto/response/forgot-password.response.dto';
import { PasswordChangeService } from '@/core/auth/services/password-change.service';
import { PasswordResetService } from '@/core/auth/services/password-reset.service';

@Controller('auth')
export class AuthPasswordController {
  constructor(
    private readonly passwordReset: PasswordResetService,
    private readonly passwordChange: PasswordChangeService,
  ) {}

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start password reset — returns masked recovery channels to choose from',
  })
  @ApiOkResponse({ type: ForgotPasswordResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<
    ServiceResponse<{
      resetId: string;
      channels: Array<{ id: string; type: string; hint: string }>;
    }>
  > {
    const data = await this.passwordReset.forgot(dto.identifier);
    return {
      message: locals.auth.password_reset_channels,
      data: ForgotPasswordResponseDto.from(data),
    };
  }

  @Post('password/forgot/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password-reset OTP to the chosen channel' })
  @ApiOkResponse()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendPasswordResetOtp(
    @Body() dto: SendPasswordResetOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.send(dto.resetId, dto.channelId);
    return { message: locals.auth.password_reset_code_sent };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reset password with a token' })
  @ApiOkResponse()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.reset(dto.token, dto.password);
    return { message: locals.auth.password_reset_successful };
  }

  @Post('password/reset/otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reset password with an OTP code' })
  @ApiOkResponse()
  async resetPasswordByOtp(
    @Body() dto: ResetPasswordByOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.resetByOtp(dto.resetId, dto.code, dto.password);
    return { message: locals.auth.password_reset_successful };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password/change')
  @ApiOperation({ summary: 'Change password (authenticated)' })
  @ApiOkResponse()
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordChange.change(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: locals.auth.password_changed };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Post('password/set')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a password for an account without one (sudo required)',
  })
  @ApiOkResponse()
  async setPassword(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: SetPasswordDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordChange.set(userId, sessionId, dto.password);
    return { message: locals.auth.password_set };
  }
}
