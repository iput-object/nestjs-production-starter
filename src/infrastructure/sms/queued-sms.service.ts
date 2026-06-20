import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Config } from '@/configs/environment.config';
import {
  SMS_JOB_SEND,
  SMS_QUEUE,
} from '@/infrastructure/queue/queue.constants';
import type { SmsJobData } from '@/infrastructure/queue/queue.types';
import type { SmsMessage, SmsPort } from '@/infrastructure/sms/sms.types';

@Injectable()
export class QueuedSmsService implements SmsPort {
  constructor(
    private readonly config: ConfigService<Config>,
    @InjectQueue(SMS_QUEUE) private readonly queue: Queue<SmsJobData>,
  ) {}

  isConfigured(): boolean {
    const sms = this.config.get<Config['sms']>('sms');
    return Boolean(sms?.accountSid && sms?.authToken && sms?.fromNumber);
  }

  async send(message: SmsMessage): Promise<void> {
    await this.queue.add(SMS_JOB_SEND, message);
  }
}
