import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { maskEmail, maskPhone } from '@/common/utils/mask.util';
import type { OtpChannel } from '@/core/auth/constants/otp-purpose.constants';
import {
  TWO_FACTOR_METHOD_TYPES,
  TwoFactorMethodType,
  type TwoFactorMethodTypeValue,
} from '@/core/auth/constants/two-factor-method.constants';

export const SUDO_OPTION_KINDS = ['password', 'otp', '2fa'] as const;
export type SudoOptionKind = (typeof SUDO_OPTION_KINDS)[number];

export type SudoOptionSource =
  | { kind: 'password' }
  | { kind: 'otp'; channel: OtpChannel; destination: string }
  | {
      kind: '2fa';
      type: TwoFactorMethodTypeValue;
      destination: string | null;
      requiresSend: boolean;
    };

@Exclude()
export class SudoOptionResponseDto {
  @Expose()
  @ApiProperty({ enum: SUDO_OPTION_KINDS })
  kind!: SudoOptionKind;

  @Expose()
  @ApiPropertyOptional({ enum: ['email', 'sms'] })
  channel?: OtpChannel;

  @Expose()
  @ApiPropertyOptional({ enum: TWO_FACTOR_METHOD_TYPES })
  type?: TwoFactorMethodTypeValue;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description: 'Masked destination for UI display only',
  })
  hint?: string | null;

  @Expose()
  @ApiPropertyOptional()
  requiresSend?: boolean;

  static from(source: SudoOptionSource): SudoOptionResponseDto {
    const dto = new SudoOptionResponseDto();
    dto.kind = source.kind;

    if (source.kind === 'otp') {
      dto.channel = source.channel;
      dto.hint =
        source.channel === 'email'
          ? maskEmail(source.destination)
          : maskPhone(source.destination);
      return dto;
    }

    if (source.kind === '2fa') {
      dto.type = source.type;
      dto.requiresSend = source.requiresSend;
      dto.hint = null;
      if (source.destination) {
        if (source.type === TwoFactorMethodType.EMAIL_OTP) {
          dto.hint = maskEmail(source.destination);
        } else if (source.type === TwoFactorMethodType.SMS_OTP) {
          dto.hint = maskPhone(source.destination);
        }
      }
    }

    return dto;
  }
}

@Exclude()
export class SudoOptionsResponseDto {
  @Expose()
  @Type(() => SudoOptionResponseDto)
  @ApiProperty({ type: () => SudoOptionResponseDto, isArray: true })
  methods!: SudoOptionResponseDto[];

  static from(methods: SudoOptionSource[]): SudoOptionsResponseDto {
    const dto = new SudoOptionsResponseDto();
    dto.methods = methods.map((method) => SudoOptionResponseDto.from(method));
    return dto;
  }
}
