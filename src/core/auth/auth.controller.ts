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
import type { Request, Response } from 'express';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import {
  AUTH_TRANSPORT_BEARER,
  AUTH_TRANSPORT_HEADER,
  REFRESH_TOKEN_COOKIE,
} from '@/core/auth/auth.constants';
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
import { ForgetPasswordDto } from '@/core/auth/dto/forget-password.dto';
import { SetPasswordDto } from '@/core/auth/dto/set-password.dto';
import { LoginDto } from '@/core/auth/dto/login.dto';
import { RefreshDto } from '@/core/auth/dto/refresh.dto';
import { RegisterDto } from '@/core/auth/dto/register.dto';
import {
  ForgotPasswordRequestOptionsDto,
  ResetPasswordByOtpDto,
  ResetPasswordDto,
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
import { PasswordResetService } from '@/core/auth/services/password-reset.service';
import { RegisterService } from '@/core/auth/services/register.service';
import { TokenService } from '@/core/auth/services/token.service';
import { TotpService } from '@/core/auth/services/totp.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';
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
  ) {}

  @Post('register')
  @ApiTransportHeader()
  async registerAccount(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.register.register(dto, this.requestContext(req));
    const body = this.deliverTokens(res, tokens, this.wantsBearer(req));
    return {
      message: locals.auth.account_created_successfully,
      ...(body && { root: body }),
    };
  }

  @Post('login')
  @ApiTransportHeader()
  async loginAccount(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.login.login(dto, this.requestContext(req));
    if (result.kind === 'tokens') {
      const body = this.deliverTokens(
        res,
        result.tokens,
        this.wantsBearer(req),
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

  @Post('refresh')
  @ApiOperation({
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
      dto.refreshToken ?? this.refreshTokenFromCookie(req);
    if (!presentedRefreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.tokens.refresh(
      presentedRefreshToken,
      this.requestContext(req),
    );
    const body = this.deliverTokens(res, tokens, fromBody);
    return {
      message: locals.auth.token_refreshed,
      ...(body && { root: body }),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    const presentedRefreshToken =
      dto.refreshToken ?? this.refreshTokenFromCookie(req);
    if (presentedRefreshToken) {
      await this.tokens.revoke(presentedRefreshToken);
    }
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.logged_out_successfully };
  }

  @Post('email/verify')
  confirmEmail(@Body() dto: ConfirmEmailVerificationDto) {
    return this.emailVerify.confirm(dto.token);
  }

  @Post('email/verify/otp')
  confirmEmailByOtp(@Body() dto: ConfirmEmailVerificationOtpDto) {
    return this.emailVerify.confirmOtp(dto.email, dto.code);
  }

  @Post('email/verify/resend')
  async resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
  ): Promise<void> {
    const sendLink = dto.sendLink ?? true;
    const sendOtp = dto.sendOtp ?? true;
    const user = await this.users.findByEmail(dto.email);
    if (user && !user.isEmailVerified) {
      if (sendLink) {
        await this.emailVerify.issueAndSend(user.id, dto.email);
      }
      if (sendOtp) {
        await this.emailVerify.issueOtpByEmail(dto.email);
      }
    }
  }

  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgetPasswordDto): Promise<void> {
    await this.passwordReset.request(dto.email, {
      sendLink: true,
      sendOtp: true,
    });
  }

  @Post('password/forgot/request')
  async forgotPasswordWithOptions(
    @Body() dto: ForgotPasswordRequestOptionsDto,
  ): Promise<void> {
    await this.passwordReset.request(dto.email, {
      sendLink: dto.sendLink ?? true,
      sendOtp: dto.sendOtp ?? true,
    });
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordReset.reset(dto.token, dto.password);
  }

  @Post('password/reset/otp')
  async resetPasswordByOtp(@Body() dto: ResetPasswordByOtpDto): Promise<void> {
    await this.passwordReset.resetByOtp(dto.email, dto.code, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password/change')
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.passwordChange.change(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('password/set')
  async setPassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    await this.passwordChange.set(userId, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('email/change/request')
  async requestEmailChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<void> {
    await this.changeContact.requestEmailChange(userId, dto.email);
  }

  @Post('email/change/confirm')
  async confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.changeContact.confirmEmailChange(dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa/methods')
  listTwoFactorMethods(@CurrentUser('sub') userId: string) {
    return this.twoFactor.listMethods(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/totp')
  async enrollTotp(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.totp.enroll(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/totp/confirm')
  async confirmTotp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ) {
    await this.totp.confirm(userId, dto.code);
    return this.firstEnrollmentBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/email/request')
  async enrollEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollEmailOtpDto,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    await this.twoFactor.enrollEmailOtp(user, dto.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/email/confirm')
  async confirmEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ) {
    await this.twoFactor.confirmEmailOtp(userId, dto.code);
    return this.firstEnrollmentBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/sms/request')
  async enrollSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollSmsOtpDto,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    await this.twoFactor.enrollSmsOtp(user, dto.phone);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/sms/confirm')
  async confirmSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ) {
    await this.twoFactor.confirmSmsOtp(userId, dto.code);
    return this.firstEnrollmentBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('2fa/methods/:methodId')
  async disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Param('methodId') methodId: string,
  ): Promise<void> {
    await this.twoFactor.disable(userId, methodId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa/backup-codes')
  countBackupCodes(@CurrentUser('sub') userId: string) {
    return this.twoFactor.countBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/backup-codes/regenerate')
  regenerateBackupCodes(@CurrentUser('sub') userId: string) {
    return this.twoFactor.regenerateBackupCodes(userId);
  }

  @Post('2fa/challenge/send')
  async sendTwoFactorChallengeCode(
    @Body() dto: TwoFactorChallengeSendDto,
  ): Promise<void> {
    await this.twoFactor.sendChallengeCode(dto.challengeId, dto.type);
  }

  @Post('2fa/challenge/verify')
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
      this.requestContext(req),
    );
    const body = this.deliverTokens(res, tokens, this.wantsBearer(req));
    return {
      message: locals.auth.logged_in_successfully,
      ...(body && { root: body }),
    };
  }

  private async firstEnrollmentBackupCodes(
    userId: string,
  ): Promise<{ data: { backupCodes: string[] } } | undefined> {
    const codes = await this.twoFactor.issueBackupCodesIfNone(userId);
    return codes ? { data: { backupCodes: codes } } : undefined;
  }

  private wantsBearer(req: Request): boolean {
    return (
      req.get(AUTH_TRANSPORT_HEADER)?.toLowerCase() === AUTH_TRANSPORT_BEARER
    );
  }

  // One channel only. Bearer clients get tokens in the body and no cookie; cookie
  // clients get the httpOnly cookie and nothing in the body.
  private deliverTokens(
    res: Response,
    tokens: AuthTokens,
    bearer: boolean,
  ): { tokens: AuthTokens } | undefined {
    if (bearer) {
      return { tokens };
    }
    this.cookies.setAuthCookies(res, tokens);
    return undefined;
  }

  private refreshTokenFromCookie(req: Request): string | undefined {
    const value = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    return typeof value === 'string' ? value : undefined;
  }

  private requestContext(req: Request): { ip?: string; userAgent?: string } {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }
}
