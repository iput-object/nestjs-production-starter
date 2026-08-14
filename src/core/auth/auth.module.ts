import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Config } from '@/configs/environment.config';
import { AuthController } from '@/core/auth/auth.controller';
import { AuthControllerHelper } from '@/core/auth/helpers/auth-controller.helper';
import { OtpGeneratorHelper } from '@/core/auth/helpers/otp-generator.helper';
import { AuthOtpTransporter } from '@/core/auth/transporters/auth-otp.transporter';
import { JwtStrategy } from '@/core/auth/strategies/jwt.strategy';
import { JwtRefreshStrategy } from '@/core/auth/strategies/jwt-refresh.strategy';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { SessionRepository } from '@/core/auth/repositories/session.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { RegisterService } from '@/core/auth/services/register.service';
import { LoginService } from '@/core/auth/services/login.service';
import { TokenService } from '@/core/auth/services/token.service';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { PhoneVerifyService } from '@/core/auth/services/phone-verify.service';
import { PasswordResetService } from '@/core/auth/services/password-reset.service';
import { PasswordChangeService } from '@/core/auth/services/password-change.service';
import { OtpService } from '@/core/auth/services/otp.service';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { TotpService } from '@/core/auth/services/totp.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import { ChangeContactService } from '@/core/auth/services/change-contact.service';
import { IdentifierService } from '@/core/auth/services/identifier.service';
import { SessionService } from '@/core/auth/services/session.service';
import { OAuthService } from '@/core/auth/services/oauth.service';
import { AccountLifecycleService } from '@/core/auth/services/account-lifecycle.service';
import { StepUpService } from '@/core/auth/services/step-up.service';
import { DevSecretLogger } from '@/core/auth/services/dev-secret-logger.service';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { FcmTokenModule } from '@/core/fcm-token/fcm-token.module';

@Module({
  imports: [
    ConfigModule,
    FcmTokenModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Config>) => {
        const auth = configService.get<Config['auth']>('auth');
        return {
          secret: auth?.jwtAccessSecret,
          signOptions: {
            expiresIn: auth?.jwtAccessExpiresIn as unknown as number,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    AuthCacheService,
    UserRepository,
    CredentialRepository,
    SessionRepository,
    TwoFactorRepository,
    IdentifierRepository,
    RegisterService,
    LoginService,
    TokenService,
    AuthCookieService,
    EmailVerifyService,
    PhoneVerifyService,
    PasswordResetService,
    PasswordChangeService,
    OtpService,
    OtpSessionService,
    TotpService,
    TwoFactorService,
    ChangeContactService,
    IdentifierService,
    SessionService,
    OAuthService,
    AccountLifecycleService,
    StepUpService,
    DevSecretLogger,
    AuthControllerHelper,
    OtpGeneratorHelper,
    AuthOtpTransporter,
  ],
  exports: [
    JwtModule,
    PassportModule,
    AuthCacheService,
    UserRepository,
    CredentialRepository,
    SessionRepository,
    TwoFactorRepository,
    IdentifierRepository,
    AccountLifecycleService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
