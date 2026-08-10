import { IsIn, IsString, MinLength } from 'class-validator';

export class OAuthIdTokenDto {
  @IsString()
  @MinLength(20)
  idToken!: string;
}

export class OAuthProviderDto {
  @IsIn(['google', 'apple'])
  provider!: 'google' | 'apple';
}
