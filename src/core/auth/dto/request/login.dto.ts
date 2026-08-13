import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import locals from '@locals';

@ValidatorConstraint({ name: 'exactlyOneEmailOrPhone', async: false })
class ExactlyOneEmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const value = args.object as LoginDto;
    return !!value.email !== !!value.phone;
  }

  defaultMessage(): string {
    return locals.auth.email_or_phone_exactly_one;
  }
}

export class LoginDto {
  @IsOptional()
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  @ApiPropertyOptional()
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value?: string }) => value?.trim())
  @IsPhoneNumber()
  @ApiPropertyOptional()
  phone?: string;

  @Validate(ExactlyOneEmailOrPhoneConstraint)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty()
  password!: string;
}
