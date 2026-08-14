import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { AllowUnverified } from '@/core/auth/decorators/allow-unverified.decorator';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import locals from '@/locals';
import {
  ConfirmEmailVerificationDto,
  ConfirmEmailVerificationOtpDto,
  ConfirmEmailVerificationSessionOtpDto,
  ResendEmailVerificationDto,
} from '@/core/auth/dto/request/verify-email.dto';
import {
  ConfirmPhoneVerificationOtpDto,
  ConfirmPhoneVerificationSessionOtpDto,
  ResendPhoneVerificationDto,
} from '@/core/auth/dto/request/verify-phone.dto';
import { ConfirmEmailByOtpResponseDto } from '@/core/auth/dto/response/confirm-email-by-otp.response.dto';
import { ConfirmEmailBySessionOtpResponseDto } from '@/core/auth/dto/response/confirm-email-by-session-otp.response.dto';
import { ConfirmEmailResponseDto } from '@/core/auth/dto/response/confirm-email.response.dto';
import { ConfirmPhoneByOtpResponseDto } from '@/core/auth/dto/response/confirm-phone-by-otp.response.dto';
import { ConfirmPhoneBySessionOtpResponseDto } from '@/core/auth/dto/response/confirm-phone-by-session-otp.response.dto';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { PhoneVerifyService } from '@/core/auth/services/phone-verify.service';

@Controller('auth')
export class AuthVerifyController {
  constructor(
    private readonly emailVerify: EmailVerifyService,
    private readonly phoneVerify: PhoneVerifyService,
  ) {}

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email with a token link' })
  @ApiOkResponse({ type: ConfirmEmailResponseDto })
  async confirmEmail(
    @Body() dto: ConfirmEmailVerificationDto,
  ): Promise<ServiceResponse<{ isAccountVerified: boolean }>> {
    const user = await this.emailVerify.confirm(dto.token);
    return {
      message: locals.auth.email_verified,
      data: plainToInstance(ConfirmEmailResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @Post('email/verify/otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email with an OTP code (public)' })
  @ApiOkResponse({ type: ConfirmEmailByOtpResponseDto })
  async confirmEmailByOtp(
    @Body() dto: ConfirmEmailVerificationOtpDto,
  ): Promise<ServiceResponse<{ isAccountVerified: boolean }>> {
    const user = await this.emailVerify.confirmOtp(dto.email, dto.code);
    return {
      message: locals.auth.email_verified,
      data: plainToInstance(ConfirmEmailByOtpResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('email/verify/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify email with OTP while signed in (post-signup session)',
  })
  @ApiOkResponse({ type: ConfirmEmailBySessionOtpResponseDto })
  async confirmEmailBySessionOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEmailVerificationSessionOtpDto,
  ) {
    const user = await this.emailVerify.confirmOtpForUser(userId, dto.code);
    return {
      message: locals.auth.email_verified,
      data: plainToInstance(ConfirmEmailBySessionOtpResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @Post('email/verify/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link/OTP (public)' })
  @ApiOkResponse()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
  ): Promise<ServiceResponse<void>> {
    await this.emailVerify.issueByEmail(dto.email);
    return { message: locals.auth.email_verification_sent };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('email/verify/resend/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend verification to the signed-in unverified user',
  })
  @ApiOkResponse()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendMyEmailVerification(
    @CurrentUser('sub') userId: string,
  ): Promise<ServiceResponse<void>> {
    await this.emailVerify.issueForUser(userId);
    return { message: locals.auth.email_verification_sent };
  }

  @Post('phone/verify/otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify phone with an OTP code (public)' })
  @ApiOkResponse({ type: ConfirmPhoneByOtpResponseDto })
  async confirmPhoneByOtp(
    @Body() dto: ConfirmPhoneVerificationOtpDto,
  ): Promise<ServiceResponse<{ isAccountVerified: boolean }>> {
    const user = await this.phoneVerify.confirmOtp(dto.phone, dto.code);
    return {
      message: locals.auth.phone_verified,
      data: plainToInstance(ConfirmPhoneByOtpResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('phone/verify/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify phone with OTP while signed in (post-signup session)',
  })
  @ApiOkResponse({ type: ConfirmPhoneBySessionOtpResponseDto })
  async confirmPhoneBySessionOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmPhoneVerificationSessionOtpDto,
  ) {
    const user = await this.phoneVerify.confirmOtpForUser(userId, dto.code);
    return {
      message: locals.auth.phone_verified,
      data: plainToInstance(ConfirmPhoneBySessionOtpResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @Post('phone/verify/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend phone verification OTP (public)' })
  @ApiOkResponse()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendPhoneVerification(
    @Body() dto: ResendPhoneVerificationDto,
  ): Promise<ServiceResponse<void>> {
    await this.phoneVerify.issueByPhone(dto.phone);
    return { message: locals.auth.phone_verification_sent };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('phone/verify/resend/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend phone verification to the signed-in unverified user',
  })
  @ApiOkResponse()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendMyPhoneVerification(
    @CurrentUser('sub') userId: string,
  ): Promise<ServiceResponse<void>> {
    await this.phoneVerify.issueForUser(userId);
    return { message: locals.auth.phone_verification_sent };
  }
}
