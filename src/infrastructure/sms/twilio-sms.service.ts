import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';
import { Config } from '@/configs/environment.config';
import { SmsMessage, SmsPort } from '@/infrastructure/sms/sms.types';

@Injectable()
export class TwilioSmsService implements SmsPort {
  private readonly logger = new Logger(TwilioSmsService.name);
  private client: Twilio | undefined;

  constructor(private readonly config: ConfigService<Config>) {}

  isConfigured(): boolean {
    const sms = this.config.get<Config['sms']>('sms');
    return Boolean(sms?.accountSid && sms?.authToken && sms?.fromNumber);
  }

  async send(message: SmsMessage): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('SMS provider not configured');
    }

    const sms = this.config.get<Config['sms']>('sms')!;
    const client = this.getClient(sms.accountSid!, sms.authToken!);

    await client.messages.create({
      to: message.to,
      from: sms.fromNumber,
      body: message.body,
    });
  }

  private getClient(accountSid: string, authToken: string): Twilio {
    if (this.client) {
      return this.client;
    }
    this.client = twilio(accountSid, authToken);
    this.logger.log('Twilio SMS client initialized');
    return this.client;
  }
}
