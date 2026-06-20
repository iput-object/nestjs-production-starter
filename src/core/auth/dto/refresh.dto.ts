import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  // Optional: web clients carry the refresh token in an httpOnly cookie, so the
  // body is empty for them. Mobile clients send it here.
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}
