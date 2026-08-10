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
import { AllowUnverified } from '@/core/auth/decorators/allow-unverified.decorator';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { VerifiedGuard } from '@/core/auth/guards/verified.guard';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { ChangePasswordDto } from '@/core/auth/dto/change-password.dto';
import { DeactivateAccountDto } from '@/core/auth/dto/deactivate-account.dto';
import {
  AddEmailDto,
  AddPhoneDto,
  ConfirmEmailChangeDto,
  ConfirmEmailChangeOtpDto,
  ConfirmIdentifierOtpDto,
  ConfirmIdentifierTokenDto,
  ConfirmPhoneChangeDto,
  IdentifierActionDto,
  RequestEmailChangeDto,
  RequestPhoneChangeDto,
} from '@/core/auth/dto/email-change.dto';
import {
  ConfirmEnrollmentDto,
  EnrollEmailOtpDto,
  EnrollSmsOtpDto,
} from '@/core/auth/dto/enroll-2fa.dto';
import { OAuthIdTokenDto } from '@/core/auth/dto/oauth.dto';
import { SetPasswordDto } from '@/core/auth/dto/set-password.dto';
import { LoginDto } from '@/core/auth/dto/login.dto';
import { RefreshDto } from '@/core/auth/dto/refresh.dto';
import { RegisterDto } from '@/core/auth/dto/register.dto';
import {
  ForgotPasswordDto,
  ResetPasswordByOtpDto,
  ResetPasswordDto,
  SendPasswordResetOtpDto,
} from '@/core/auth/dto/reset-password.dto';
import {
  DisableTwoFactorDto,
  RegenerateBackupCodesDto,
} from '@/core/auth/dto/step-up.dto';
import {
  TwoFactorChallengeSendDto,
  TwoFactorChallengeVerifyDto,
} from '@/core/auth/dto/verify-2fa.dto';
import {
  ConfirmEmailVerificationDto,
  ConfirmEmailVerificationOtpDto,
  ConfirmEmailVerificationSessionOtpDto,
  ResendEmailVerificationDto,
} from '@/core/auth/dto/verify-email.dto';
import { AccountLifecycleService } from '@/core/auth/services/account-lifecycle.service';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { ChangeContactService } from '@/core/auth/services/change-contact.service';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { IdentifierService } from '@/core/auth/services/identifier.service';
import { LoginService } from '@/core/auth/services/login.service';
import { OAuthService } from '@/core/auth/services/oauth.service';
import { PasswordChangeService } from '@/core/auth/services/password-change.service';
import { PasswordResetService } from '@/core/auth/services/password-reset.service';
import { RegisterService } from '@/core/auth/services/register.service';
import { SessionService } from '@/core/auth/services/session.service';
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
    private readonly identifiers: IdentifierService,
    private readonly sessions: SessionService,
    private readonly oauth: OAuthService,
    private readonly accountLifecycle: AccountLifecycleService,
    private readonly twoFactor: TwoFactorService,
    private readonly totp: TotpService,
    private readonly helper: AuthControllerHelper,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new account and start a session' })
  @ApiTransportHeader()
  async registerAccount(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.register.register(
      dto,
      this.helper.requestContext(req),
    );
    const body = this.helper.deliverTokens(
      res,
      result.tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.account_created_successfully,
      data: result.user,
      ...(body && { root: body }),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with email or phone + password' })
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

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with Google ID token' })
  @ApiTransportHeader()
  async oauthGoogle(
    @Body() dto: OAuthIdTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.oauth.loginWithGoogle(
      dto.idToken,
      this.helper.requestContext(req),
    );
    const body = this.helper.deliverTokens(
      res,
      result.tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.oauth_login_successful,
      data: result.user,
      ...(body && { root: body }),
    };
  }

  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with Apple ID token' })
  @ApiTransportHeader()
  async oauthApple(
    @Body() dto: OAuthIdTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.oauth.loginWithApple(
      dto.idToken,
      this.helper.requestContext(req),
    );
    const body = this.helper.deliverTokens(
      res,
      result.tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.oauth_login_successful,
      data: result.user,
      ...(body && { root: body }),
    };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('oauth/google/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link Google account to the current user' })
  async linkGoogle(
    @CurrentUser('sub') userId: string,
    @Body() dto: OAuthIdTokenDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.oauth.linkGoogle(
      userId,
      dto.idToken,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.oauth_linked };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('oauth/apple/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link Apple account to the current user' })
  async linkApple(
    @CurrentUser('sub') userId: string,
    @Body() dto: OAuthIdTokenDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.oauth.linkApple(
      userId,
      dto.idToken,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.oauth_linked };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromBody = dto.refreshToken != null;
    const presentedRefreshToken =
      dto.refreshToken ?? this.helper.refreshTokenFromCookie(req);
    if (!presentedRefreshToken) {
      throw new UnauthorizedException(locals.auth.refresh_token_required);
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

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Get('me')
  @ApiOperation({
    summary: 'Current user profile (allowed while email is unverified)',
  })
  async me(@CurrentUser('sub') userId: string) {
    const user = await this.users.findAuthUser(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    return { data: user };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out of all devices' })
  async logoutAll(
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    await this.sessions.revokeAll(userId, this.helper.requestContext(req));
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.logged_out_all_successfully };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  async listSessions(
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    const refresh = this.helper.refreshTokenFromCookie(req);
    return {
      data: await this.sessions.list(userId, refresh),
    };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.sessions.revokeOne(
      userId,
      sessionId,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.session_revoked };
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email with a token link' })
  async confirmEmail(
    @Body() dto: ConfirmEmailVerificationDto,
  ): Promise<ServiceResponse<{ isAccountVerified: boolean }>> {
    const user = await this.emailVerify.confirm(dto.token);
    return { message: locals.auth.email_verified, data: user };
  }

  @Post('email/verify/otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify email with an OTP code (public)' })
  async confirmEmailByOtp(
    @Body() dto: ConfirmEmailVerificationOtpDto,
  ): Promise<ServiceResponse<{ isAccountVerified: boolean }>> {
    const user = await this.emailVerify.confirmOtp(dto.email, dto.code);
    return { message: locals.auth.email_verified, data: user };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('email/verify/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify email with OTP while signed in (post-signup session)',
  })
  async confirmEmailBySessionOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEmailVerificationSessionOtpDto,
  ) {
    const user = await this.emailVerify.confirmOtpForUser(userId, dto.code);
    return { message: locals.auth.email_verified, data: user };
  }

  @Post('email/verify/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link/OTP (public)' })
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendMyEmailVerification(
    @CurrentUser('sub') userId: string,
  ): Promise<ServiceResponse<void>> {
    await this.emailVerify.issueForUser(userId);
    return { message: locals.auth.email_verification_sent };
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start password reset — returns masked recovery channels to choose from',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<
    ServiceResponse<{
      resetId: string;
      channels: Array<{ id: string; type: string; hint: string }>;
    }>
  > {
    const data = await this.passwordReset.forgot(dto.identifier);
    return { message: locals.auth.password_reset_channels, data };
  }

  @Post('password/forgot/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password-reset OTP to the chosen channel' })
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
  async resetPasswordByOtp(
    @Body() dto: ResetPasswordByOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordReset.resetByOtp(dto.resetId, dto.code, dto.password);
    return { message: locals.auth.password_reset_successful };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Patch('password/change')
  @ApiOperation({ summary: 'Change password (authenticated)' })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.passwordChange.change(
      userId,
      dto.currentPassword,
      dto.newPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.password_changed };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('password/set')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a password for an account without one' })
  async setPassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: SetPasswordDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.passwordChange.set(
      userId,
      dto.password,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.password_set };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Get('identifiers')
  @ApiOperation({ summary: 'List email and phone identifiers' })
  async listIdentifiers(@CurrentUser('sub') userId: string) {
    return { data: await this.identifiers.list(userId) };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request adding a secondary email' })
  async addEmail(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddEmailDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.requestAddEmail(
      userId,
      dto.email,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.email_change_requested };
  }

  @Post('identifiers/email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm secondary email via magic link' })
  async confirmAddEmail(
    @Body() dto: ConfirmIdentifierTokenDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.confirmAddEmailByToken(dto.token);
    return { message: locals.auth.email_added };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/email/confirm/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm secondary email via OTP' })
  async confirmAddEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmIdentifierOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.confirmAddEmailByOtp(userId, dto.code);
    return { message: locals.auth.email_added };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request adding a phone number' })
  async addPhone(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddPhoneDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.requestAddPhone(
      userId,
      dto.phone,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.phone_change_requested };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/phone/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm phone number via OTP' })
  async confirmAddPhone(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmIdentifierOtpDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.confirmAddPhone(userId, dto.code);
    return { message: locals.auth.phone_added };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/:id/primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set an identifier as primary' })
  async setPrimaryIdentifier(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: IdentifierActionDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.setPrimary(
      userId,
      id,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.primary_identifier_updated };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Delete('identifiers/:id')
  @ApiOperation({ summary: 'Remove a non-primary identifier' })
  async removeIdentifier(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: IdentifierActionDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.remove(
      userId,
      id,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.identifier_removed };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('email/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request primary email change (step-up required)' })
  async requestEmailChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestEmailChangeDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestEmailChange(
      userId,
      dto.email,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.email_change_requested };
  }

  @Post('email/change/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm primary email change via magic link' })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
  ): Promise<ServiceResponse<{ userId: string; email: string }>> {
    const result = await this.changeContact.confirmEmailChange(dto.token);
    return { message: locals.auth.email_changed, data: result };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('email/change/confirm/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm primary email change via OTP' })
  async confirmEmailChangeOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEmailChangeOtpDto,
  ): Promise<ServiceResponse<{ userId: string; email: string }>> {
    const result = await this.changeContact.confirmEmailChangeByOtp(
      userId,
      dto.code,
    );
    return { message: locals.auth.email_changed, data: result };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('phone/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request primary phone change (step-up required)' })
  async requestPhoneChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestPhoneChangeDto,
    @Req() req: Request,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestPhoneChange(
      userId,
      dto.phone,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    return { message: locals.auth.phone_change_requested };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('phone/change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm primary phone change via OTP' })
  async confirmPhoneChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmPhoneChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.confirmPhoneChange(userId, dto.code);
    return { message: locals.auth.phone_changed };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('account/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete (deactivate) the current account' })
  async deactivateAccount(
    @CurrentUser('sub') userId: string,
    @Body() dto: DeactivateAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    await this.accountLifecycle.deactivate(
      userId,
      dto.currentPassword,
      this.helper.requestContext(req),
    );
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.account_deactivated };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Get('2fa/methods')
  @ApiOperation({ summary: 'List enrolled two-factor methods' })
  listTwoFactorMethods(@CurrentUser('sub') userId: string) {
    return this.twoFactor.listMethods(userId);
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/enroll/totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin TOTP authenticator enrollment' })
  async enrollTotp(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    return this.totp.enroll(user);
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/enroll/email/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin email OTP two-factor enrollment' })
  async enrollEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollEmailOtpDto,
  ): Promise<ServiceResponse<void>> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    await this.twoFactor.enrollEmailOtp(userId, dto.email);
    return { message: locals.auth.two_factor_code_sent };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/enroll/sms/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin SMS OTP two-factor enrollment' })
  async enrollSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollSmsOtpDto,
  ): Promise<ServiceResponse<void>> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    await this.twoFactor.enrollSmsOtp(userId, dto.phone);
    return { message: locals.auth.two_factor_code_sent };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Delete('2fa/methods/:methodId')
  @ApiOperation({ summary: 'Disable a two-factor method (step-up required)' })
  async disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Param('methodId') methodId: string,
    @Body() dto: DisableTwoFactorDto,
  ): Promise<ServiceResponse<void>> {
    await this.twoFactor.disable(userId, methodId, dto.currentPassword);
    return { message: locals.auth.two_factor_disabled };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Get('2fa/backup-codes')
  @ApiOperation({ summary: 'Count remaining backup codes' })
  countBackupCodes(@CurrentUser('sub') userId: string) {
    return this.twoFactor.countBackupCodes(userId);
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes (step-up required)' })
  regenerateBackupCodes(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegenerateBackupCodesDto,
  ) {
    return this.twoFactor.regenerateBackupCodes(userId, dto.currentPassword);
  }

  @Post('2fa/challenge/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a two-factor challenge code' })
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
