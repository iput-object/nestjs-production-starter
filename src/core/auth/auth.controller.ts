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
  registerAccount(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.register.register(dto, this.requestContext(req));
  }

  @Post('login')
  loginAccount(@Body() dto: LoginDto, @Req() req: Request) {
    return this.login.login(dto, this.requestContext(req));
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
    return this.tokens.rotate(
      payload.sub,
      dto.refreshToken,
      this.requestContext(req),
    );
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<{ success: true }> {
    await this.tokens.revoke(dto.refreshToken);
    return { success: true };
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
  ): Promise<{ success: true }> {
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
    return { success: true };
  }

  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgetPasswordDto): Promise<{ success: true }> {
    await this.passwordReset.request(dto.email, { sendLink: true, sendOtp: true });
    return { success: true };
  }

  @Post('password/forgot/request')
  async forgotPasswordWithOptions(
    @Body() dto: ForgotPasswordRequestOptionsDto,
  ): Promise<{ success: true }> {
    await this.passwordReset.request(dto.email, {
      sendLink: dto.sendLink ?? true,
      sendOtp: dto.sendOtp ?? true,
    });
    return { success: true };
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: true }> {
    await this.passwordReset.reset(dto.token, dto.password);
    return { success: true };
  }

  @Post('password/reset/otp')
  async resetPasswordByOtp(
    @Body() dto: ResetPasswordByOtpDto,
  ): Promise<{ success: true }> {
    await this.passwordReset.resetByOtp(dto.email, dto.code, dto.password);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password/change')
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    await this.passwordChange.change(userId, dto.currentPassword, dto.newPassword);
    return { success: true };
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
  ): Promise<{ success: true }> {
    await this.totp.confirm(userId, dto.code);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/email/request')
  async enrollEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollEmailOtpDto,
  ): Promise<{ success: true }> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    await this.twoFactor.enrollEmailOtp(user, dto.email);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/email/confirm')
  async confirmEmailOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ): Promise<{ success: true }> {
    await this.twoFactor.confirmEmailOtp(userId, dto.code);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/sms/request')
  async enrollSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: EnrollSmsOtpDto,
  ): Promise<{ success: true }> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    await this.twoFactor.enrollSmsOtp(user, dto.phone);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enroll/sms/confirm')
  async confirmSmsOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmEnrollmentDto,
  ): Promise<{ success: true }> {
    await this.twoFactor.confirmSmsOtp(userId, dto.code);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('2fa/methods/:methodId')
  async disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Param('methodId') methodId: string,
  ): Promise<{ success: true }> {
    await this.twoFactor.disable(userId, methodId);
    return { success: true };
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
  ): Promise<{ success: true }> {
    await this.twoFactor.sendChallengeCode(dto.challengeId, dto.type);
    return { success: true };
  }

  @Post('2fa/challenge/verify')
  verifyTwoFactorChallenge(
    @Body() dto: TwoFactorChallengeVerifyDto,
    @Req() req: Request,
  ) {
    return this.twoFactor.verifyChallenge(
      dto.challengeId,
      dto.type,
      dto.code,
      this.requestContext(req),
    );
  }

  private requestContext(req: Request): { ip?: string; userAgent?: string } {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }
}
