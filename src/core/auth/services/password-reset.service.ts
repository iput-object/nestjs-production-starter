import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider, User } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { maskEmail, maskPhone } from '@/common/utils/mask.util';
import { SMS_PORT } from '@/infrastructure/sms/sms.constants';
import type { SmsPort } from '@/infrastructure/sms/sms.types';
import {
  AuthCacheService,
  ResetChannel,
} from '@/core/auth/services/auth-cache.service';
import { TokenService } from '@/core/auth/services/token.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import { AuthMailType } from '@/core/auth/transporters/auth-otp.transporter';

const BCRYPT_ROUNDS = 12;

export interface ResetChannelOption {
  channel: ResetChannel;
  hint: string;
}

export interface ResetChannelsResult {
  requestId: string;
  channels: ResetChannelOption[];
  /** True when a single channel existed and the code was sent automatically. */
  sent: boolean;
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly tokens: TokenService,
    private readonly otpSession: OtpSessionService,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
  ) {}

  /**
   * Resolves the account from an email or phone and lists the channels it can
   * reset through. With exactly one channel the code is sent immediately, so
   * the client can skip straight to code entry.
   */
  async discoverChannels(identifier: string): Promise<ResetChannelsResult> {
    const user = await this.resolveUser(identifier);
    const channels = user ? this.availableChannels(user) : [];
    const requestId = this.crypto.randomToken(32);

    if (!user || channels.length === 0) {
      return { requestId, channels: [], sent: false };
    }

    await this.cache.setResetRequest(
      requestId,
      { userId: user.id, channels },
      AUTH_POLICY.resetRequestTtlSeconds,
    );

    const options = channels.map((channel) => ({
      channel,
      hint: this.hintFor(user, channel),
    }));

    if (channels.length === 1) {
      await this.issueForChannel(user, channels[0]);
      return { requestId, channels: options, sent: true };
    }

    return { requestId, channels: options, sent: false };
  }

  async sendOtp(requestId: string, channel: ResetChannel): Promise<void> {
    const request = await this.cache.getResetRequest(requestId);
    if (!request || !request.channels.includes(channel)) {
      throw new UnauthorizedException('Reset request is invalid or expired');
    }
    const user = await this.users.findById(request.userId);
    if (!user) {
      throw new UnauthorizedException('Reset request is invalid or expired');
    }
    await this.issueForChannel(user, channel);
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const { userId, purpose } = await this.otpSession.verifyByToken(token);
    if (purpose !== 'reset-password') {
      throw new NotFoundException('Reset link is invalid or expired');
    }
    await this.applyNewPassword(userId, newPassword);
  }

  async resetByOtp(
    requestId: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const request = await this.cache.getResetRequest(requestId);
    if (!request) {
      throw new UnauthorizedException('Code is invalid or expired');
    }
    await this.otpSession.verifyByCode(request.userId, 'reset-password', code);
    await this.applyNewPassword(request.userId, newPassword);
    await this.cache.deleteResetRequest(requestId);
  }

  private async resolveUser(identifier: string): Promise<User | null> {
    return identifier.includes('@')
      ? this.users.findByEmail(identifier.toLowerCase())
      : this.users.findByPhone(identifier);
  }

  private availableChannels(user: User): ResetChannel[] {
    const channels: ResetChannel[] = [];
    if (user.email && user.isEmailVerified) {
      channels.push('email');
    }
    if (user.phone && user.isPhoneVerified && this.sms.isConfigured()) {
      channels.push('sms');
    }
    return channels;
  }

  // Resolves the contact for a channel, guarding against the account having
  // dropped that email/phone since the channels were discovered.
  private destinationFor(user: User, channel: ResetChannel): string {
    const destination = channel === 'email' ? user.email : user.phone;
    if (!destination) {
      throw new UnauthorizedException('Reset request is invalid or expired');
    }
    return destination;
  }

  private hintFor(user: User, channel: ResetChannel): string {
    const destination = this.destinationFor(user, channel);
    return channel === 'email'
      ? maskEmail(destination)
      : maskPhone(destination);
  }

  private async issueForChannel(
    user: User,
    channel: ResetChannel,
  ): Promise<void> {
    // Email also carries the magic link (one-winner with the code); SMS is
    // code-only.
    const tokens =
      channel === 'email'
        ? [TokenType.CODE, TokenType.TOKEN]
        : [TokenType.CODE];

    await this.otpSession.issue({
      userId: user.id,
      purpose: 'reset-password',
      channel,
      destination: this.destinationFor(user, channel),
      mailType: AuthMailType.RESET_PASSWORD,
      tokens,
      ttlSeconds: AUTH_POLICY.passwordResetTtlSeconds,
    });
  }

  private async applyNewPassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (!credential) {
      throw new NotFoundException('No password credential on this account');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.updatePasswordHash(credential.id, passwordHash);
    await this.tokens.revokeAllForUser(userId);
  }
}
