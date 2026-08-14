import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class SudoSendChallengeDto {
  @ApiProperty({ enum: ['email_otp', 'sms_otp'] })
  @IsEnum(['email_otp', 'sms_otp'])
  method!: 'email_otp' | 'sms_otp';
}
