import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Config } from '@/configs/environment.config';
import { MailerPort, MailMessage } from '@/infrastructure/mailer/mailer.types';

@Injectable()
export class MailerService implements MailerPort, OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | undefined;

  constructor(private readonly config: ConfigService<Config>) {}

  async send(message: MailMessage): Promise<void> {
    const mail = this.config.get<Config['mail']>('mail');
    if (!mail) {
      throw new Error('Mail configuration missing');
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: mail.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  onModuleDestroy(): void {
    this.transporter?.close();
    this.transporter = undefined;
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const mail = this.config.get<Config['mail']>('mail');
    if (!mail) {
      throw new Error('Mail configuration missing');
    }

    this.transporter = createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: { user: mail.user, pass: mail.pass },
    });

    this.logger.log(`Mailer initialized via ${mail.host}:${mail.port}`);
    return this.transporter;
  }
}
