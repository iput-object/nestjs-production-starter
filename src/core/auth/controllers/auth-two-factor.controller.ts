import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { RequireSudo } from '@/core/auth/decorators/require-sudo.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import {
  ApiTransportHeader,
  AuthControllerHelper,
} from '@/core/auth/helpers/auth-controller.helper';
import locals from '@/locals';
import { ConfirmEmailOtpDto } from '@/core/auth/dto/request/confirm-email-otp.dto';
import { ConfirmSmsOtpDto } from '@/core/auth/dto/request/confirm-sms-otp.dto';
import { ConfirmTotpDto } from '@/core/auth/dto/request/confirm-totp.dto';
import {
  TwoFactorChallengeSendDto,
  TwoFactorChallengeVerifyDto,
} from '@/core/auth/dto/request/verify-2fa.dto';
import { AuthTokensResponseDto } from '@/core/auth/dto/response/auth-tokens.response.dto';
import { ConfirmEmailOtpResponseDto } from '@/core/auth/dto/response/confirm-email-otp.response.dto';
import { ConfirmSmsOtpResponseDto } from '@/core/auth/dto/response/confirm-sms-otp.response.dto';
import { ConfirmTotpResponseDto } from '@/core/auth/dto/response/confirm-totp.response.dto';
import { CountBackupCodesResponseDto } from '@/core/auth/dto/response/count-backup-codes.response.dto';
import { EnrollTotpResponseDto } from '@/core/auth/dto/response/enroll-totp.response.dto';
import { ListTwoFactorMethodsResponseDto } from '@/core/auth/dto/response/list-two-factor-methods.response.dto';
import { RegenerateBackupCodesResponseDto } from '@/core/auth/dto/response/regenerate-backup-codes.response.dto';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { TotpService } from '@/core/auth/services/totp.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';

@Controller('auth')
export class AuthTwoFactorController {
  constructor(
    private readonly users: UserRepository,
    private readonly twoFactor: TwoFactorService,
    private readonly totp: TotpService,
    private readonly helper: AuthControllerHelper,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('2fa/methods')
  @ApiOperation({ summary: 'List enrolled two-factor methods' })
  @ApiOkResponse({ type: ListTwoFactorMethodsResponseDto })
  async listTwoFactorMethods(
    @CurrentUser('sub') userId: string,
  ): Promise<ListTwoFactorMethodsResponseDto[]> {
    const methods = await this.twoFactor.listMethods(userId);
    return plainToInstance(ListTwoFactorMethodsResponseDto, methods, {
      excludeExtraneousValues: true,
    });
  }

  @RequireSudo()
  @Post('2fa/enroll/totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Begin TOTP authenticator enrollment (sudo required)',
  })
  @ApiOkResponse({ type: EnrollTotpResponseDto })
  async enrollTotp(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    const enrollment = await this.totp.enroll(user);
    return plainToInstance(EnrollTotpResponseDto, enrollment, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/totp/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm TOTP enrollment with a code' })
  @ApiOkResponse({ type: ConfirmTotpResponseDto })
  async confirmTotp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmTotpDto,
  ) {
    await this.totp.confirm(userId, dto.code);
    const codes = await this.helper.firstEnrollmentBackupCodes(userId);
    return codes
      ? {
          data: plainToInstance(
            ConfirmTotpResponseDto,
            { backupCodes: codes },
            { excludeExtraneousValues: true },
          ),
        }
      : undefined;
  }

  @RequireSudo()
  @Post('2fa/enroll/email/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Begin email OTP two-factor enrollment on a verified account email (sudo required)',
  })
  @ApiOkResponse()
  async enrollEmailOtp(
    @CurrentUser('sub') userId: string,
  ): Promise<ServiceResponse<void>> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    await this.twoFactor.enrollEmailOtp(userId);
    return { message: locals.auth.two_factor_code_sent };
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email OTP enrollment with a code' })
  @ApiOkResponse({ type: ConfirmEmailOtpResponseDto })
  async confirmEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEmailOtpDto,
  ) {
    await this.twoFactor.confirmEmailOtp(userId, dto.code);
    const codes = await this.helper.firstEnrollmentBackupCodes(userId);
    return codes
      ? {
          data: plainToInstance(
            ConfirmEmailOtpResponseDto,
            { backupCodes: codes },
            { excludeExtraneousValues: true },
          ),
        }
      : undefined;
  }

  @RequireSudo()
  @Post('2fa/enroll/sms/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Begin SMS OTP two-factor enrollment on a verified account phone (sudo required)',
  })
  @ApiOkResponse()
  async enrollSmsOtp(
    @CurrentUser('sub') userId: string,
  ): Promise<ServiceResponse<void>> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    await this.twoFactor.enrollSmsOtp(userId);
    return { message: locals.auth.two_factor_code_sent };
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/sms/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm SMS OTP enrollment with a code' })
  @ApiOkResponse({ type: ConfirmSmsOtpResponseDto })
  async confirmSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmSmsOtpDto,
  ) {
    await this.twoFactor.confirmSmsOtp(userId, dto.code);
    const codes = await this.helper.firstEnrollmentBackupCodes(userId);
    return codes
      ? {
          data: plainToInstance(
            ConfirmSmsOtpResponseDto,
            { backupCodes: codes },
            { excludeExtraneousValues: true },
          ),
        }
      : undefined;
  }

  @RequireSudo({ consume: true })
  @Delete('2fa/methods/:methodId')
  @ApiOperation({ summary: 'Disable a two-factor method (sudo required)' })
  @ApiOkResponse()
  async disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Param('methodId') methodId: string,
  ): Promise<ServiceResponse<void>> {
    await this.twoFactor.disable(userId, methodId);
    return { message: locals.auth.two_factor_disabled };
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa/backup-codes')
  @ApiOperation({ summary: 'Count remaining backup codes' })
  @ApiOkResponse({ type: CountBackupCodesResponseDto })
  async countBackupCodes(@CurrentUser('sub') userId: string) {
    const result = await this.twoFactor.countBackupCodes(userId);
    return plainToInstance(CountBackupCodesResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @RequireSudo({ consume: true })
  @Post('2fa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes (sudo required)' })
  @ApiOkResponse({ type: RegenerateBackupCodesResponseDto })
  async regenerateBackupCodes(@CurrentUser('sub') userId: string) {
    const result = await this.twoFactor.regenerateBackupCodes(userId);
    return plainToInstance(RegenerateBackupCodesResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('2fa/challenge/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a two-factor challenge code' })
  @ApiOkResponse()
  async sendTwoFactorChallengeCode(
    @Body() dto: TwoFactorChallengeSendDto,
  ): Promise<ServiceResponse<void>> {
    await this.twoFactor.sendChallengeCode(dto.challengeId, dto.type);
    return { message: locals.auth.two_factor_code_sent };
  }

  @Post('2fa/challenge/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify a two-factor challenge code' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiTransportHeader()
  async verifyTwoFactorChallenge(
    @Body() dto: TwoFactorChallengeVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.twoFactor.verifyChallenge(
      dto.challengeId,
      dto.type,
      dto.code,
    );
    const body = this.helper.deliverTokens(
      res,
      tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.logged_in_successfully,
      ...(body && { root: body }),
    };
  }
}
