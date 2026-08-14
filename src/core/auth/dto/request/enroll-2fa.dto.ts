import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** Email/SMS 2FA enroll uses a verified identifier already on the account. */
export class ConfirmEnrollmentDto {
  @IsString()
  @Matches(/^\d{4,10}$/)
  @ApiProperty()
  code!: string;
}
