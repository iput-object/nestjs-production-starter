import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import type { TwoFactorMethod } from '@prisma-client';
import {
  TWO_FACTOR_METHOD_TYPES,
  TwoFactorMethodType,
  type TwoFactorMethodTypeValue,
} from '@/core/auth/constants/two-factor-method.constants';
import { maskEmail, maskPhone } from '@/common/utils/mask.util';

@Exclude()
export class TwoFactorMethodResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ enum: TWO_FACTOR_METHOD_TYPES })
  type!: TwoFactorMethodTypeValue;

  @Expose()
  @ApiProperty()
  isEnabled!: boolean;

  @Expose()
  @ApiProperty()
  isPrimary!: boolean;

  @Expose()
  @Transform(
    ({ obj }) => {
      const source = obj as TwoFactorMethod;
      if (!source.destination) return null;
      return source.type === TwoFactorMethodType.EMAIL_OTP
        ? maskEmail(source.destination)
        : maskPhone(source.destination);
    },
    { toClassOnly: true },
  )
  @ApiProperty({ nullable: true })
  destination!: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  lastUsedAt!: Date | null;

  @Expose()
  @ApiProperty({ nullable: true })
  verifiedAt!: Date | null;

  @Expose()
  @ApiProperty()
  createdAt!: Date;
}
