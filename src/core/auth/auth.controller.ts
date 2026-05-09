import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Config } from '@/configs/environment.config';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { ChangePasswordDto } from '@/core/auth/dto/change-password.dto';
import {
  ConfirmEnrollmentDto,
  EnrollEmailOtpDto,
  EnrollSmsOtpDto,
} from '@/core/auth/dto/enroll-2fa.dto';
import { ForgetPasswordDto } from '@/core/auth/dto/forget-password.dto';
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
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { LoginService } from '@/core/auth/services/login.service';
import { PasswordChangeService } from '@/core/auth/services/password-change.service';
import { PasswordResetService } from '@/core/auth/services/password-reset.service';
import { RegisterService } from '@/core/auth/services/register.service';
import { TokenService } from '@/core/auth/services/token.service';
import { TotpService } from '@/core/auth/services/totp.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import locals from '@/locals';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly config: ConfigService<Config>,
    private readonly jwt: JwtService,
    private readonly users: UserRepository,
    private readonly register: RegisterService,
    private readonly login: LoginService,
    private readonly tokens: TokenService,
    private readonly emailVerify: EmailVerifyService,
    private readonly passwordReset: PasswordResetService,
    private readonly passwordChange: PasswordChangeService,
    private readonly twoFactor: TwoFactorService,
    private readonly totp: TotpService,
  ) {}

  @Post('register')
  async registerAccount(@Body() dto: RegisterDto, @Req() req: Request) {
    const tokens = await this.register.register(dto, this.requestContext(req));
    return {
      message: locals.auth.account_created_successfully,
      root: { tokens },
    };
  }

  @Post('login')
  async loginAccount(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.login.login(dto, this.requestContext(req));
    if (result.kind === 'tokens') {
      return {
        message: locals.auth.logged_in_successfully,
        data: result.user,
        root: { tokens: result.tokens },
      };
    }
    return {
      message: locals.auth.two_factor_required,
      root: { challengeId: result.challengeId, methods: result.methods },
    };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const auth = this.config.get<Config['auth']>('auth')!;
    const payload = await this.jwt.verifyAsync<JwtPayload>(dto.refreshToken, {
      secret: auth.jwtRefreshSecret,
    });
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.tokens.rotate(
      payload.sub,
      dto.refreshToken,
      this.requestContext(req),
    );
    return { root: { tokens } };
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.tokens.revoke(dto.refreshToken);
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
    await this.passwordReset.request(dto.email, { sendLink: true, sendOtp: true });
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
  async resetPasswordByOtp(
    @Body() dto: ResetPasswordByOtpDto,
  ): Promise<void> {
    await this.passwordReset.resetByOtp(dto.email, dto.code, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password/change')
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.passwordChange.change(userId, dto.currentPassword, dto.newPassword);
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
  ): Promise<void> {
    await this.totp.confirm(userId, dto.code);
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
  ): Promise<void> {
    await this.twoFactor.confirmEmailOtp(userId, dto.code);
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
  ): Promise<void> {
    await this.twoFactor.confirmSmsOtp(userId, dto.code);
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
  @Post('2fa/methods/:methodId/backup-codes/regenerate')
  regenerateBackupCodes(
    @CurrentUser('sub') userId: string,
    @Param('methodId') methodId: string,
  ) {
    return this.twoFactor.regenerateBackupCodes(userId, methodId);
  }

  @Post('2fa/challenge/send')
  async sendTwoFactorChallengeCode(
    @Body() dto: TwoFactorChallengeSendDto,
  ): Promise<void> {
    await this.twoFactor.sendChallengeCode(dto.challengeId, dto.type);
  }

  @Post('2fa/challenge/verify')
  async verifyTwoFactorChallenge(
    @Body() dto: TwoFactorChallengeVerifyDto,
    @Req() req: Request,
  ) {
    const tokens = await this.twoFactor.verifyChallenge(
      dto.challengeId,
      dto.type,
      dto.code,
      this.requestContext(req),
    );
    return { root: { tokens } };
  }

  private requestContext(req: Request): { ip?: string; userAgent?: string } {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }
}
