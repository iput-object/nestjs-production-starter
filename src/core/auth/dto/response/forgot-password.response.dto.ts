import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  RecoveryChannelResponseDto,
  type RecoveryChannelSource,
} from '@/core/auth/dto/response/recovery-channel.response.dto';

interface ForgotPasswordSource {
  resetId: string;
  channels: RecoveryChannelSource[];
}

@Exclude()
export class ForgotPasswordResponseDto {
  @Expose()
  @ApiProperty()
  resetId!: string;

  @Expose()
  @Type(() => RecoveryChannelResponseDto)
  @ApiProperty({ type: () => RecoveryChannelResponseDto, isArray: true })
  channels!: RecoveryChannelResponseDto[];

  static from(source: ForgotPasswordSource): ForgotPasswordResponseDto {
    const dto = new ForgotPasswordResponseDto();
    dto.resetId = source.resetId;
    dto.channels = source.channels.map((channel) =>
      RecoveryChannelResponseDto.from(channel),
    );
    return dto;
  }
}
