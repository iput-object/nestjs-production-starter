import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  TWO_FACTOR_METHOD_TYPES,
  type TwoFactorMethodTypeValue,
} from '@/core/auth/constants/two-factor-method.constants';

export class SudoPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty()
  password!: string;
}

export class SudoOtpRequestDto {
  @IsIn(['email', 'sms'])
  @ApiProperty({ enum: ['email', 'sms'] })
  channel!: 'email' | 'sms';
}

export class SudoOtpConfirmDto {
  @IsIn(['email', 'sms'])
  @ApiProperty({ enum: ['email', 'sms'] })
  channel!: 'email' | 'sms';

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @ApiProperty()
  code!: string;
}

export class SudoTwoFactorSendDto {
  @IsIn(TWO_FACTOR_METHOD_TYPES)
  @ApiProperty({ enum: TWO_FACTOR_METHOD_TYPES })
  type!: TwoFactorMethodTypeValue;
}

export class SudoTwoFactorDto {
  @IsIn(TWO_FACTOR_METHOD_TYPES)
  @ApiProperty({ enum: TWO_FACTOR_METHOD_TYPES })
  type!: TwoFactorMethodTypeValue;

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  @ApiProperty()
  code!: string;
}
