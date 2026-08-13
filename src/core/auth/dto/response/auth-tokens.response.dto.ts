import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { TokenPairResponseDto } from '@/core/auth/dto/response/token-pair.response.dto';

@Exclude()
export class AuthTokensResponseDto {
  @Expose()
  @Type(() => TokenPairResponseDto)
  @ApiProperty({ type: () => TokenPairResponseDto })
  access!: TokenPairResponseDto;

  @Expose()
  @Type(() => TokenPairResponseDto)
  @ApiProperty({ type: () => TokenPairResponseDto })
  refresh!: TokenPairResponseDto;
}
