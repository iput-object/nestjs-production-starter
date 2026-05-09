import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Config } from '@/configs/environment.config';

/**
 * Logs OTPs and verification tokens to stdout when `app.debug` is true
 * (i.e. NODE_ENV=development or DEBUG=true). No-op in production. The
 * single config gate makes this trivial to audit and disable.
 */
@Injectable()
export class DevSecretLogger {
  private readonly logger = new Logger('DevSecret');
  private readonly enabled: boolean;

  constructor(config: ConfigService<Config>) {
    this.enabled = config.get<Config['app']>('app')!.debug;
  }

  log(label: string, value: string, context?: Record<string, unknown>): void {
    if (!this.enabled) return;
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    this.logger.warn(`[DEV] ${label}=${value}${ctx}`);
  }
}
