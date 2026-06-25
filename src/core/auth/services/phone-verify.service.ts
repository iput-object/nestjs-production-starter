import { BadRequestException, Injectable } from '@nestjs/common';
import { OtpService } from '@/core/auth/services/otp.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import locals from '@/locals';

@Injectable()
export class PhoneVerifyService {
  constructor(
    private readonly otp: OtpService,
    private readonly users: UserRepository,
  ) {}

  async issueAndSend(userId: string, phone: string): Promise<void> {
    if (!phone) {
      throw new BadRequestException(locals.auth.phone_required);
    }
    await this.otp.send({
      channel: 'sms',
      userId,
      purpose: 'register-verify',
      destination: phone,
    });
  }

  async confirm(userId: string, code: string): Promise<void> {
    await this.otp.verify({
      channel: 'sms',
      userId,
      purpose: 'register-verify',
      code,
    });
    await this.users.markPhoneVerified(userId);
  }
}
