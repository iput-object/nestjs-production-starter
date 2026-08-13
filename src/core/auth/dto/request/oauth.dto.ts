import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class OAuthIdTokenDto {
  @IsString()
  @MinLength(20)
  @ApiProperty()
  idToken!: string;
}

export class OAuthProviderDto {
  @IsIn(['google', 'apple'])
  @ApiProperty({ enum: ['google', 'apple'] })
  provider!: 'google' | 'apple';
}
