import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import locals from '@locals';

@ValidatorConstraint({ name: 'emailOrPhone', async: false })
class EmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const value = args.object as RegisterDto;
    return !!value.email || !!value.phone;
  }

  defaultMessage(): string {
    return locals.auth.email_or_phone_required;
  }
}

export class RegisterDto {
  @IsOptional()
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value?: string }) => value?.trim())
  @IsPhoneNumber()
  phone?: string;

  @Validate(EmailOrPhoneConstraint)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
