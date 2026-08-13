import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class TotpEnrollmentResponseDto {
  @Expose()
  @ApiProperty()
  methodId!: string;

  @Expose()
  @ApiProperty()
  secret!: string;

  @Expose()
  @ApiProperty()
  otpauthUrl!: string;

  @Expose()
  @ApiProperty()
  qrDataUrl!: string;
}
