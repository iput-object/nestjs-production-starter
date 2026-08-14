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
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { AuthControllerHelper } from '@/core/auth/helpers/auth-controller.helper';
import type { Request, Response } from 'express';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { AUTH_TRANSPORT_HEADER } from '@/core/auth/auth.constants';
import { AllowUnverified } from '@/core/auth/decorators/allow-unverified.decorator';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { VerifiedGuard } from '@/core/auth/guards/verified.guard';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { ChangePasswordDto } from '@/core/auth/dto/request/change-password.dto';
import { DeactivateAccountDto } from '@/core/auth/dto/request/deactivate-account.dto';
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
import {
  EnrollEmailOtpDto,
  EnrollSmsOtpDto,
} from '@/core/auth/dto/request/enroll-2fa.dto';
import { AppleOAuthDto } from '@/core/auth/dto/request/apple-oauth.dto';
import { ConfirmAddEmailOtpDto } from '@/core/auth/dto/request/confirm-add-email-otp.dto';
import { ConfirmAddPhoneDto } from '@/core/auth/dto/request/confirm-add-phone.dto';
import { ConfirmEmailOtpDto } from '@/core/auth/dto/request/confirm-email-otp.dto';
import { ConfirmSmsOtpDto } from '@/core/auth/dto/request/confirm-sms-otp.dto';
import { ConfirmTotpDto } from '@/core/auth/dto/request/confirm-totp.dto';
import { GoogleOAuthDto } from '@/core/auth/dto/request/google-oauth.dto';
import { LinkAppleDto } from '@/core/auth/dto/request/link-apple.dto';
import { LinkGoogleDto } from '@/core/auth/dto/request/link-google.dto';
import { LogoutDto } from '@/core/auth/dto/request/logout.dto';
import { RemoveIdentifierDto } from '@/core/auth/dto/request/remove-identifier.dto';
import { SetPrimaryIdentifierDto } from '@/core/auth/dto/request/set-primary-identifier.dto';
import { SetPasswordDto } from '@/core/auth/dto/request/set-password.dto';
import { LoginDto } from '@/core/auth/dto/request/login.dto';
import { RefreshDto } from '@/core/auth/dto/request/refresh.dto';
import { RegisterDto } from '@/core/auth/dto/request/register.dto';
import {
  ForgotPasswordDto,
  ResetPasswordByOtpDto,
  ResetPasswordDto,
  SendPasswordResetOtpDto,
} from '@/core/auth/dto/request/reset-password.dto';
import {
  DisableTwoFactorDto,
  RegenerateBackupCodesDto,
} from '@/core/auth/dto/request/step-up.dto';
import {
  TwoFactorChallengeSendDto,
  TwoFactorChallengeVerifyDto,
} from '@/core/auth/dto/request/verify-2fa.dto';
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
import { AuthTokensResponseDto } from '@/core/auth/dto/response/auth-tokens.response.dto';
import { ForgotPasswordResponseDto } from '@/core/auth/dto/response/forgot-password.response.dto';
import { RegisterResponseDto } from '@/core/auth/dto/response/register.response.dto';
import { LoginResponseDto } from '@/core/auth/dto/response/login.response.dto';
import { OauthGoogleResponseDto } from '@/core/auth/dto/response/oauth-google.response.dto';
import { OauthAppleResponseDto } from '@/core/auth/dto/response/oauth-apple.response.dto';
import { MeResponseDto } from '@/core/auth/dto/response/me.response.dto';
import { ListSessionsResponseDto } from '@/core/auth/dto/response/list-sessions.response.dto';
import { ConfirmEmailResponseDto } from '@/core/auth/dto/response/confirm-email.response.dto';
import { ConfirmEmailByOtpResponseDto } from '@/core/auth/dto/response/confirm-email-by-otp.response.dto';
import { ConfirmEmailBySessionOtpResponseDto } from '@/core/auth/dto/response/confirm-email-by-session-otp.response.dto';
import { ConfirmPhoneByOtpResponseDto } from '@/core/auth/dto/response/confirm-phone-by-otp.response.dto';
import { ConfirmPhoneBySessionOtpResponseDto } from '@/core/auth/dto/response/confirm-phone-by-session-otp.response.dto';
import { ListIdentifiersResponseDto } from '@/core/auth/dto/response/list-identifiers.response.dto';
import { ConfirmEmailChangeResponseDto } from '@/core/auth/dto/response/confirm-email-change.response.dto';
import { ConfirmEmailChangeOtpResponseDto } from '@/core/auth/dto/response/confirm-email-change-otp.response.dto';
import { ListTwoFactorMethodsResponseDto } from '@/core/auth/dto/response/list-two-factor-methods.response.dto';
import { EnrollTotpResponseDto } from '@/core/auth/dto/response/enroll-totp.response.dto';
import { ConfirmTotpResponseDto } from '@/core/auth/dto/response/confirm-totp.response.dto';
import { ConfirmEmailOtpResponseDto } from '@/core/auth/dto/response/confirm-email-otp.response.dto';
import { ConfirmSmsOtpResponseDto } from '@/core/auth/dto/response/confirm-sms-otp.response.dto';
import { CountBackupCodesResponseDto } from '@/core/auth/dto/response/count-backup-codes.response.dto';
import { RegenerateBackupCodesResponseDto } from '@/core/auth/dto/response/regenerate-backup-codes.response.dto';
import { AccountLifecycleService } from '@/core/auth/services/account-lifecycle.service';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { ChangeContactService } from '@/core/auth/services/change-contact.service';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { IdentifierService } from '@/core/auth/services/identifier.service';
import { LoginService } from '@/core/auth/services/login.service';
import { OAuthService } from '@/core/auth/services/oauth.service';
import { PasswordChangeService } from '@/core/auth/services/password-change.service';
import { PasswordResetService } from '@/core/auth/services/password-reset.service';
import { PhoneVerifyService } from '@/core/auth/services/phone-verify.service';
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
    private readonly phoneVerify: PhoneVerifyService,
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
  @ApiOperation({
    summary: 'Register with email and/or phone and start a session',
  })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiTransportHeader()
  async registerAccount(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.register.register(dto);
    const body = this.helper.deliverTokens(
      res,
      result.tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.account_created_successfully,
      data: plainToInstance(RegisterResponseDto, result.user, {
        excludeExtraneousValues: true,
      }),
      ...(body && { root: body }),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with email or phone + password' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiTransportHeader()
  async loginAccount(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.login.login(dto);
    if (result.kind === 'tokens') {
      const body = this.helper.deliverTokens(
        res,
        result.tokens,
        this.helper.wantsBearer(req),
      );
      return {
        message: locals.auth.logged_in_successfully,
        data: plainToInstance(LoginResponseDto, result.user, {
          excludeExtraneousValues: true,
        }),
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
  @ApiOkResponse({ type: OauthGoogleResponseDto })
  @ApiTransportHeader()
  async oauthGoogle(
    @Body() dto: GoogleOAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.oauth.loginWithGoogle(dto.idToken);
    const body = this.helper.deliverTokens(
      res,
      result.tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.oauth_login_successful,
      data: plainToInstance(OauthGoogleResponseDto, result.user, {
        excludeExtraneousValues: true,
      }),
      ...(body && { root: body }),
    };
  }

  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with Apple ID token' })
  @ApiOkResponse({ type: OauthAppleResponseDto })
  @ApiTransportHeader()
  async oauthApple(
    @Body() dto: AppleOAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.oauth.loginWithApple(dto.idToken);
    const body = this.helper.deliverTokens(
      res,
      result.tokens,
      this.helper.wantsBearer(req),
    );
    return {
      message: locals.auth.oauth_login_successful,
      data: plainToInstance(OauthAppleResponseDto, result.user, {
        excludeExtraneousValues: true,
      }),
      ...(body && { root: body }),
    };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('oauth/google/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link Google account to the current user' })
  @ApiOkResponse()
  async linkGoogle(
    @CurrentUser('sub') userId: string,
    @Body() dto: LinkGoogleDto,
  ): Promise<ServiceResponse<void>> {
    await this.oauth.linkGoogle(userId, dto.idToken);
    return { message: locals.auth.oauth_linked };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('oauth/apple/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link Apple account to the current user' })
  @ApiOkResponse()
  async linkApple(
    @CurrentUser('sub') userId: string,
    @Body() dto: LinkAppleDto,
  ): Promise<ServiceResponse<void>> {
    await this.oauth.linkApple(userId, dto.idToken);
    return { message: locals.auth.oauth_linked };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  async refresh(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromBody = dto.refreshToken != null;
    const presentedRefreshToken =
      dto.refreshToken ?? this.helper.refreshTokenFromCookie(req);
    if (!presentedRefreshToken) {
      throw new UnauthorizedException(locals.auth.refresh_token_required);
    }
    const tokens = await this.tokens.refresh(presentedRefreshToken);
    const body = this.helper.deliverTokens(res, tokens, fromBody);
    return {
      message: locals.auth.token_refreshed,
      ...(body && { root: body }),
    };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Log out and revoke the refresh token' })
  @ApiOkResponse()
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
    summary: 'Current user profile (allowed while the account is unverified)',
  })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser('sub') userId: string) {
    const user = await this.users.findAuthUser(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    return {
      data: plainToInstance(MeResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out of all devices' })
  @ApiOkResponse()
  async logoutAll(
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    await this.sessions.revokeAll(userId);
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.logged_out_all_successfully };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  @ApiOkResponse({ type: ListSessionsResponseDto })
  async listSessions(@CurrentUser('sub') userId: string, @Req() req: Request) {
    const refresh = this.helper.refreshTokenFromCookie(req);
    return {
      data: plainToInstance(
        ListSessionsResponseDto,
        await this.sessions.list(userId, refresh),
        { excludeExtraneousValues: true },
      ),
    };
  }

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiOkResponse()
  async revokeSession(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<ServiceResponse<void>> {
    await this.sessions.revokeOne(userId, sessionId);
    return { message: locals.auth.session_revoked };
  }

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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('password/set')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a password for an account without one' })
  @ApiOkResponse()
  async setPassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: SetPasswordDto,
  ): Promise<ServiceResponse<void>> {
    await this.passwordChange.set(userId, dto.password);
    return { message: locals.auth.password_set };
  }

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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request adding a secondary email' })
  @ApiOkResponse()
  async addEmail(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddEmailDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.requestAddEmail(
      userId,
      dto.email,
      dto.currentPassword,
    );
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request adding a phone number' })
  @ApiOkResponse()
  async addPhone(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddPhoneDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.requestAddPhone(
      userId,
      dto.phone,
      dto.currentPassword,
    );
    return { message: locals.auth.phone_change_requested };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('identifiers/:id/primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set an identifier as primary' })
  @ApiOkResponse()
  async setPrimaryIdentifier(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: SetPrimaryIdentifierDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.setPrimary(userId, id, dto.currentPassword);
    return { message: locals.auth.primary_identifier_updated };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Delete('identifiers/:id')
  @ApiOperation({ summary: 'Remove a non-primary identifier' })
  @ApiOkResponse()
  async removeIdentifier(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: RemoveIdentifierDto,
  ): Promise<ServiceResponse<void>> {
    await this.identifiers.remove(userId, id, dto.currentPassword);
    return { message: locals.auth.identifier_removed };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('email/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request primary email change (step-up required)' })
  @ApiOkResponse()
  async requestEmailChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestEmailChange(
      userId,
      dto.email,
      dto.currentPassword,
    );
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('phone/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request primary phone change (step-up required)' })
  @ApiOkResponse()
  async requestPhoneChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestPhoneChangeDto,
  ): Promise<ServiceResponse<void>> {
    await this.changeContact.requestPhoneChange(
      userId,
      dto.phone,
      dto.currentPassword,
    );
    return { message: locals.auth.phone_change_requested };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('account/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete (deactivate) the current account' })
  @ApiOkResponse()
  async deactivateAccount(
    @CurrentUser('sub') userId: string,
    @Body() dto: DeactivateAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceResponse<void>> {
    await this.accountLifecycle.deactivate(userId, dto.currentPassword);
    this.cookies.clearAuthCookies(res);
    return { message: locals.auth.account_deactivated };
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/enroll/totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin TOTP authenticator enrollment' })
  @ApiOkResponse({ type: EnrollTotpResponseDto })
  async enrollTotp(@CurrentUser('sub') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(locals.auth.user_not_found);
    const enrollment = await this.totp.enroll(user);
    return plainToInstance(EnrollTotpResponseDto, enrollment, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/enroll/email/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin email OTP two-factor enrollment' })
  @ApiOkResponse()
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/enroll/sms/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin SMS OTP two-factor enrollment' })
  @ApiOkResponse()
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

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Delete('2fa/methods/:methodId')
  @ApiOperation({ summary: 'Disable a two-factor method (step-up required)' })
  @ApiOkResponse()
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
  @ApiOkResponse({ type: CountBackupCodesResponseDto })
  async countBackupCodes(@CurrentUser('sub') userId: string) {
    const result = await this.twoFactor.countBackupCodes(userId);
    return plainToInstance(CountBackupCodesResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, VerifiedGuard)
  @Post('2fa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes (step-up required)' })
  @ApiOkResponse({ type: RegenerateBackupCodesResponseDto })
  async regenerateBackupCodes(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegenerateBackupCodesDto,
  ) {
    const result = await this.twoFactor.regenerateBackupCodes(
      userId,
      dto.currentPassword,
    );
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
