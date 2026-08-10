import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsPhoneNumber,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StepUpPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
}

export class RequestEmailChangeDto extends StepUpPasswordDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ConfirmEmailChangeOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code!: string;
}

export class RequestPhoneChangeDto extends StepUpPasswordDto {
  @IsPhoneNumber()
  phone!: string;
}

export class ConfirmPhoneChangeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code!: string;
}

export class AddEmailDto extends StepUpPasswordDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class AddPhoneDto extends StepUpPasswordDto {
  @IsPhoneNumber()
  phone!: string;
}

export class ConfirmIdentifierOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code!: string;
}

export class ConfirmIdentifierTokenDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class IdentifierActionDto extends StepUpPasswordDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
