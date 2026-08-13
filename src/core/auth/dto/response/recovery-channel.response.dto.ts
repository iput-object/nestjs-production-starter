import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { maskEmail, maskPhone } from '@/common/utils/mask.util';

export interface RecoveryChannelSource {
  id: string;
  type: 'EMAIL' | 'PHONE';
  destination: string;
}

@Exclude()
export class RecoveryChannelResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ enum: ['EMAIL', 'PHONE'] })
  type!: 'EMAIL' | 'PHONE';

  @Expose()
  @ApiProperty()
  hint!: string;

  static from(source: RecoveryChannelSource): RecoveryChannelResponseDto {
    const dto = new RecoveryChannelResponseDto();
    dto.id = source.id;
    dto.type = source.type;
    dto.hint =
      source.type === 'EMAIL'
        ? maskEmail(source.destination)
        : maskPhone(source.destination);
    return dto;
  }
}
