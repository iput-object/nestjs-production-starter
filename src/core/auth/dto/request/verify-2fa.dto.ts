import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MinLength } from 'class-validator';
import {
  TWO_FACTOR_METHOD_TYPES,
  type TwoFactorMethodTypeValue,
} from '@/core/auth/constants/two-factor-method.constants';

export class TwoFactorChallengeVerifyDto {
  @IsString()
  @MinLength(10)
  @ApiProperty()
  challengeId!: string;

  @IsIn(TWO_FACTOR_METHOD_TYPES)
  @ApiProperty({ enum: TWO_FACTOR_METHOD_TYPES })
  type!: TwoFactorMethodTypeValue;

  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,32}$/)
  @ApiProperty()
  code!: string;
}

export class TwoFactorChallengeSendDto {
  @IsString()
  @MinLength(10)
  @ApiProperty()
  challengeId!: string;

  @IsIn(TWO_FACTOR_METHOD_TYPES)
  @ApiProperty({ enum: TWO_FACTOR_METHOD_TYPES })
  type!: TwoFactorMethodTypeValue;
}
