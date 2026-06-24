import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthControllerHelper } from '@/core/auth/helpers/auth-controller.helper';
import type { Request, Response } from 'express';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { AUTH_TRANSPORT_HEADER } from '@/core/auth/auth.constants';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { ChangePasswordDto } from '@/core/auth/dto/change-password.dto';
import {
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
} from '@/core/auth/dto/email-change.dto';
import {
  ConfirmEnrollmentDto,
  EnrollEmailOtpDto,
  EnrollSmsOtpDto,
} from '@/core/auth/dto/enroll-2fa.dto';
import { SetPasswordDto } from '@/core/auth/dto/set-password.dto';
import { LoginDto } from '@/core/auth/dto/login.dto';
import { RefreshDto } from '@/core/auth/dto/refresh.dto';
import { RegisterDto } from '@/core/auth/dto/register.dto';
import {
  ForgotPasswordChannelsDto,
  ResetPasswordByOtpDto,
  ResetPasswordDto,
  SendResetOtpDto,
} from '@/core/auth/dto/reset-password.dto';
import {
  TwoFactorChallengeSendDto,
  TwoFactorChallengeVerifyDto,
} from '@/core/auth/dto/verify-2fa.dto';
import {
  ConfirmEmailVerificationDto,
  ConfirmEmailVerificationOtpDto,
  ResendEmailVerificationDto,
} from '@/core/auth/dto/verify-email.dto';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { ChangeContactService } from '@/core/auth/services/change-contact.service';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { LoginService } from '@/core/auth/services/login.service';
import { PasswordChangeService } from '@/core/auth/services/password-change.service';
import {
  PasswordResetService,
  ResetChannelsResult,
} from '@/core/auth/services/password-reset.service';
import { RegisterService } from '@/core/auth/services/register.service';
import { TokenService } from '@/core/auth/services/token.service';
import { TotpService } from '@/core/auth/services/totp.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import locals from '@/locals';

const ApiTransportHeader = () =>
  ApiHeader({
    name: AUTH_TRANSPORT_HEADER,
    required: false,
    description:
      "Send 'bearer' to receive tokens in the response body (mobile/API clients). " +
      'Omit to receive httpOnly auth cookies instead (web).',
  });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UserRepository,
    private readonly register: RegisterService,
    private readonly login: LoginService,
    private readonly tokens: TokenService,
    private readonly cookies: AuthCookieService,
    private readonly emailVerify: EmailVerifyService,
    private readonly passwordReset: PasswordResetService,
    private readonly passwordChange: PasswordChangeService,
    private readonly changeContact: ChangeContactService,
    private readonly twoFactor: TwoFactorService,
    private readonly totp: TotpService,
    private readonly helper: AuthControllerHelper,
  ) {}

  /** Register a new account */
  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiTransportHeader()
  async registerAccount(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.register.register(
      dto,
      this.helper.requestContext(req),
    );
    const body = this.helper.deliverTokens(
      res,
      tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.account_created_successfully,
      ...(body && { root: body }),
    };
  }

  /** Log in with credentials */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with credentials' })
  @ApiTransportHeader()
  async loginAccount(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.login.login(dto, this.helper.requestContext(req));
    if (result.kind === 'tokens') {
      const body = this.helper.deliverTokens(
        res,
        result.tokens,
        this.helper.wantsBearer(req),
      );
      return {
        message: locals.auth.logged_in_successfully,
        data: result.user,
        ...(body && { root: body }),
      };
    }
    return {
      message: locals.auth.two_factor_required,
      root: { challengeId: result.challengeId, methods: result.methods },
    };
  }

  /** Refresh access and refresh tokens */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access and refresh tokens',
    description:
      'Rotates tokens. Delivery follows the presented refresh token: sent in the ' +
      'body → new tokens in the body; sent via the refresh cookie → a new httpOnly ' +
      'cookie and no tokens in the body. The X-Auth-Transport header is ignored here.',
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Refresh ignores the header and keys off where the token came from. A web
    // XSS payload can trigger this route (the httpOnly refresh cookie auto-sends)
    // but cannot read that cookie to present it in the body, so it can never coax
    // a body-token response. Mobile presents its refresh token in the body.
    const fromBody = dto.refreshToken != null;
    const presentedRefreshToken =
      dto.refreshToken ?? this.helper.refreshTokenFromCookie(req);
    if (!presentedRefreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.tokens.refresh(
      presentedRefreshToken,
      this.helper.requestContext(req),
    );
    const body = this.helper.deliverTokens(res, tokens, fromBody);
    return {
      message: locals.auth.token_refreshed,
      ...(body && { root: body }),
    };
  }

  /** Log out and revoke the refresh token */
  @Post('logout')
  @ApiOperation({ summary: 'Log out and revoke the refresh token' })
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    const presentedRefreshToken =
      dto.refreshToken ?? this.helper.refreshTokenFromCookie(req);
    if (presentedRefreshToken) {
      await this.tokens.revoke(presentedRefreshToken);
    }
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.logged_out_successfully };
  }

  /** Verify email with a token link */
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with a token link' })
  async confirmEmail(
    @Body() dto: ConfirmEmailVerificationDto,
  ): Promise<ServiceResponse<void>> {
    await this.emailVerify.confirm(dto.token);
    return { message: locals.auth.email_verified };
  }

  /** Verify email with an OTP code */
  @Post('email/verify/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with an OTP code' })
  async confirmEmailByOtp(
    @Body() dto: ConfirmEmailVerificationOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.emailVerify.confirmOtp(dto.email, dto.code);
    return { message: locals.auth.email_verified };
  }

  /** Resend email verification link/OTP */
  @Post('email/verify/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link/OTP' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
  ): Promise<ServiceResponse<void>> {
    await this.emailVerify.issueByEmail(dto.email);
    return { message: locals.auth.email_verification_sent };
  }

  /** List the channels an account can reset through (email/SMS) */
  @Post('password/forgot/channels')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List password reset channels for an account' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPasswordChannels(
    @Body() dto: ForgotPasswordChannelsDto,
  ): Promise<ServiceResponse<ResetChannelsResult>> {
    const result = await this.passwordReset.discoverChannels(dto.identifier);
    return { message: locals.auth.password_reset_channels, data: result };
  }

  /** Send a reset code on the chosen channel */
  @Post('password/forgot/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a reset code on the chosen channel' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendResetOtp(
    @Body() dto: SendResetOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.sendOtp(dto.requestId, dto.channel);
    return { message: locals.auth.password_reset_code_sent };
  }

  /** Reset password with a token */
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with a token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.reset(dto.token, dto.password);
    return { message: locals.auth.password_reset_successful };
  }

  /** Reset password with an OTP code */
  @Post('password/reset/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with an OTP code' })
  async resetPasswordByOtp(
    @Body() dto: ResetPasswordByOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.resetByOtp(dto.requestId, dto.code, dto.password);
    return { message: locals.auth.password_reset_successful };
  }

  @UseGuards(JwtAuthGuard)
  /** Change password (authenticated) */
  @Patch('password/change')
  @ApiOperation({ summary: 'Change password (authenticated)' })
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

  @UseGuards(JwtAuthGuard)
  /** Set a password for an account without one */
  @Post('password/set')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a password for an account without one' })
  async setPassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: SetPasswordDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordChange.set(userId, dto.password);
    return { message: locals.auth.password_set };
  }

  @UseGuards(JwtAuthGuard)
  /** Request an email address change */
  @Post('email/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an email address change' })
  async requestEmailChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestEmailChange(userId, dto.email);
    return { message: locals.auth.email_change_requested };
  }

  /** Confirm an email address change */
  @Post('email/change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email address change' })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
  ): Promise<ServiceResponse<{ userId: string; email: string }>> {
    const result = await this.changeContact.confirmEmailChange(dto.token);
    return { message: locals.auth.email_changed, data: result };
  }

  @UseGuards(JwtAuthGuard)
  /** List enrolled two-factor methods */
  @Get('2fa/methods')
  @ApiOperation({ summary: 'List enrolled two-factor methods' })
  listTwoFactorMethods(@CurrentUser('sub') userId: string) {
    return this.twoFactor.listMethods(userId);
  }

  @UseGuards(JwtAuthGuard)
  /** Begin TOTP authenticator enrollment */
  @Post('2fa/enroll/totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin TOTP authenticator enrollment' })
  async enrollTotp(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.totp.enroll(user);
  }

  @UseGuards(JwtAuthGuard)
  /** Confirm TOTP enrollment with a code */
  @Post('2fa/enroll/totp/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm TOTP enrollment with a code' })
  async confirmTotp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ) {
    await this.totp.confirm(userId, dto.code);
    return this.helper.firstEnrollmentBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  /** Begin email OTP two-factor enrollment */
  @Post('2fa/enroll/email/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin email OTP two-factor enrollment' })
  async enrollEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollEmailOtpDto,
  ): Promise<ServiceResponse<void>> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    await this.twoFactor.enrollEmailOtp(user, dto.email);
    return { message: locals.auth.two_factor_code_sent };
  }

  @UseGuards(JwtAuthGuard)
  /** Confirm email OTP enrollment with a code */
  @Post('2fa/enroll/email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email OTP enrollment with a code' })
  async confirmEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ) {
    await this.twoFactor.confirmEmailOtp(userId, dto.code);
    return this.helper.firstEnrollmentBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  /** Begin SMS OTP two-factor enrollment */
  @Post('2fa/enroll/sms/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin SMS OTP two-factor enrollment' })
  async enrollSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollSmsOtpDto,
  ): Promise<ServiceResponse<void>> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    await this.twoFactor.enrollSmsOtp(user, dto.phone);
    return { message: locals.auth.two_factor_code_sent };
  }

  @UseGuards(JwtAuthGuard)
  /** Confirm SMS OTP enrollment with a code */
  @Post('2fa/enroll/sms/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm SMS OTP enrollment with a code' })
  async confirmSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ) {
    await this.twoFactor.confirmSmsOtp(userId, dto.code);
    return this.helper.firstEnrollmentBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  /** Disable a two-factor method */
  @Delete('2fa/methods/:methodId')
  @ApiOperation({ summary: 'Disable a two-factor method' })
  async disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Param('methodId') methodId: string,
  ): Promise<ServiceResponse<void>> {
    await this.twoFactor.disable(userId, methodId);
    return { message: locals.auth.two_factor_disabled };
  }

  @UseGuards(JwtAuthGuard)
  /** Count remaining backup codes */
  @Get('2fa/backup-codes')
  @ApiOperation({ summary: 'Count remaining backup codes' })
  countBackupCodes(@CurrentUser('sub') userId: string) {
    return this.twoFactor.countBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  /** Regenerate backup codes */
  @Post('2fa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes' })
  regenerateBackupCodes(@CurrentUser('sub') userId: string) {
    return this.twoFactor.regenerateBackupCodes(userId);
  }

  /** Send a two-factor challenge code */
  @Post('2fa/challenge/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a two-factor challenge code' })
  async sendTwoFactorChallengeCode(
    @Body() dto: TwoFactorChallengeSendDto,
  ): Promise<ServiceResponse<void>> {
    await this.twoFactor.sendChallengeCode(dto.challengeId, dto.type);
    return { message: locals.auth.two_factor_code_sent };
  }

  /** Verify a two-factor challenge code */
  @Post('2fa/challenge/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a two-factor challenge code' })
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
      this.helper.requestContext(req),
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
