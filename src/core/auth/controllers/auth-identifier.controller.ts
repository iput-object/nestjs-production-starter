import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { Response } from 'express';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { AllowUnverified } from '@/core/auth/decorators/allow-unverified.decorator';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { SudoGuard } from '@/core/auth/guards/sudo.guard';
import locals from '@/locals';
import {
  AddEmailDto,
  AddPhoneDto,
  ConfirmEmailChangeDto,
  ConfirmEmailChangeOtpDto,
  ConfirmIdentifierTokenDto,
  ConfirmPhoneChangeDto,
  RequestEmailChangeDto,
  RequestPhoneChangeDto,
} from '@/core/auth/dto/request/email-change.dto';
import { ConfirmAddEmailOtpDto } from '@/core/auth/dto/request/confirm-add-email-otp.dto';
import { ConfirmAddPhoneDto } from '@/core/auth/dto/request/confirm-add-phone.dto';
import { ConfirmEmailChangeOtpResponseDto } from '@/core/auth/dto/response/confirm-email-change-otp.response.dto';
import { ConfirmEmailChangeResponseDto } from '@/core/auth/dto/response/confirm-email-change.response.dto';
import { ListIdentifiersResponseDto } from '@/core/auth/dto/response/list-identifiers.response.dto';
import { AccountLifecycleService } from '@/core/auth/services/account-lifecycle.service';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { ChangeContactService } from '@/core/auth/services/change-contact.service';
import { IdentifierService } from '@/core/auth/services/identifier.service';

@Controller('auth')
export class AuthIdentifierController {
  constructor(
    private readonly identifiers: IdentifierService,
    private readonly changeContact: ChangeContactService,
    private readonly accountLifecycle: AccountLifecycleService,
    private readonly cookies: AuthCookieService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Get('identifiers')
  @ApiOperation({ summary: 'List email and phone identifiers' })
  @ApiOkResponse({ type: ListIdentifiersResponseDto })
  async listIdentifiers(@CurrentUser('sub') userId: string) {
    const identifiers = await this.identifiers.list(userId);
    return {
      data: plainToInstance(ListIdentifiersResponseDto, identifiers, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Post('identifiers/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request adding a secondary email (sudo required)' })
  @ApiOkResponse()
  async addEmail(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: AddEmailDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.requestAddEmail(userId, sessionId, dto.email);
    return { message: locals.auth.email_change_requested };
  }

  @Post('identifiers/email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm secondary email via magic link' })
  @ApiOkResponse()
  async confirmAddEmail(
    @Body() dto: ConfirmIdentifierTokenDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.confirmAddEmailByToken(dto.token);
    return { message: locals.auth.email_added };
  }

  @UseGuards(JwtAuthGuard)
  @Post('identifiers/email/confirm/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm secondary email via OTP' })
  @ApiOkResponse()
  async confirmAddEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmAddEmailOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.confirmAddEmailByOtp(userId, dto.code);
    return { message: locals.auth.email_added };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Post('identifiers/phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request adding a phone number (sudo required)' })
  @ApiOkResponse()
  async addPhone(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: AddPhoneDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.requestAddPhone(userId, sessionId, dto.phone);
    return { message: locals.auth.phone_change_requested };
  }

  @UseGuards(JwtAuthGuard)
  @Post('identifiers/phone/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm phone number via OTP' })
  @ApiOkResponse()
  async confirmAddPhone(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmAddPhoneDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.confirmAddPhone(userId, dto.code);
    return { message: locals.auth.phone_added };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Post('identifiers/:id/primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set an identifier as primary (sudo required)' })
  @ApiOkResponse()
  async setPrimaryIdentifier(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Param('id') id: string,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.setPrimary(userId, sessionId, id);
    return { message: locals.auth.primary_identifier_updated };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Delete('identifiers/:id')
  @ApiOperation({ summary: 'Remove a non-primary identifier (sudo required)' })
  @ApiOkResponse()
  async removeIdentifier(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Param('id') id: string,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.remove(userId, sessionId, id);
    return { message: locals.auth.identifier_removed };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Post('email/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request primary email change (sudo required)' })
  @ApiOkResponse()
  async requestEmailChange(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestEmailChange(userId, sessionId, dto.email);
    return { message: locals.auth.email_change_requested };
  }

  @Post('email/change/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm primary email change via magic link' })
  @ApiOkResponse({ type: ConfirmEmailChangeResponseDto })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
  ): Promise<ServiceResponse<{ userId: string; email: string }>> {
    const result = await this.changeContact.confirmEmailChange(dto.token);
    return {
      message: locals.auth.email_changed,
      data: plainToInstance(ConfirmEmailChangeResponseDto, result, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('email/change/confirm/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm primary email change via OTP' })
  @ApiOkResponse({ type: ConfirmEmailChangeOtpResponseDto })
  async confirmEmailChangeOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEmailChangeOtpDto,
  ): Promise<ServiceResponse<{ userId: string; email: string }>> {
    const result = await this.changeContact.confirmEmailChangeByOtp(
      userId,
      dto.code,
    );
    return {
      message: locals.auth.email_changed,
      data: plainToInstance(ConfirmEmailChangeOtpResponseDto, result, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @Post('phone/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request primary phone change (sudo required)' })
  @ApiOkResponse()
  async requestPhoneChange(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: RequestPhoneChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestPhoneChange(userId, sessionId, dto.phone);
    return { message: locals.auth.phone_change_requested };
  }

  @UseGuards(JwtAuthGuard)
  @Post('phone/change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm primary phone change via OTP' })
  @ApiOkResponse()
  async confirmPhoneChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmPhoneChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.confirmPhoneChange(userId, dto.code);
    return { message: locals.auth.phone_changed };
  }

  @UseGuards(JwtAuthGuard, SudoGuard)
  @AllowUnverified()
  @Post('account/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete (deactivate) the current account (sudo required)',
  })
  @ApiOkResponse()
  async deactivateAccount(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    await this.accountLifecycle.deactivate(userId, sessionId);
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.account_deactivated };
  }
}
