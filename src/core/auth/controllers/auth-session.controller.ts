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
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { AllowUnverified } from '@/core/auth/decorators/allow-unverified.decorator';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import {
  ApiTransportHeader,
  AuthControllerHelper,
} from '@/core/auth/helpers/auth-controller.helper';
import locals from '@/locals';
import { AppleOAuthDto } from '@/core/auth/dto/request/apple-oauth.dto';
import { GoogleOAuthDto } from '@/core/auth/dto/request/google-oauth.dto';
import { LinkAppleDto } from '@/core/auth/dto/request/link-apple.dto';
import { LinkGoogleDto } from '@/core/auth/dto/request/link-google.dto';
import { LoginDto } from '@/core/auth/dto/request/login.dto';
import { LogoutDto } from '@/core/auth/dto/request/logout.dto';
import { RefreshDto } from '@/core/auth/dto/request/refresh.dto';
import { RegisterDto } from '@/core/auth/dto/request/register.dto';
import { AuthTokensResponseDto } from '@/core/auth/dto/response/auth-tokens.response.dto';
import { ListSessionsResponseDto } from '@/core/auth/dto/response/list-sessions.response.dto';
import { LoginResponseDto } from '@/core/auth/dto/response/login.response.dto';
import { MeResponseDto } from '@/core/auth/dto/response/me.response.dto';
import { OauthAppleResponseDto } from '@/core/auth/dto/response/oauth-apple.response.dto';
import { OauthGoogleResponseDto } from '@/core/auth/dto/response/oauth-google.response.dto';
import { RegisterResponseDto } from '@/core/auth/dto/response/register.response.dto';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { LoginService } from '@/core/auth/services/login.service';
import { OAuthService } from '@/core/auth/services/oauth.service';
import { RegisterService } from '@/core/auth/services/register.service';
import { SessionService } from '@/core/auth/services/session.service';
import { TokenService } from '@/core/auth/services/token.service';

@Controller('auth')
export class AuthSessionController {
  constructor(
    private readonly users: UserRepository,
    private readonly register: RegisterService,
    private readonly login: LoginService,
    private readonly tokens: TokenService,
    private readonly cookies: AuthCookieService,
    private readonly sessions: SessionService,
    private readonly oauth: OAuthService,
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

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
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
}
