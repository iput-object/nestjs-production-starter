import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class AccountVerificationResponseDto {
  @Expose()
  @ApiProperty()
  isAccountVerified!: boolean;
}
