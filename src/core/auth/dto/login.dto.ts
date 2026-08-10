import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /** Email or phone used to sign in. */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  identifier!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
