import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsPhoneNumber,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestEmailChangeDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  @ApiProperty()
  email!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @MinLength(20)
  @ApiProperty()
  token!: string;
}

export class ConfirmEmailChangeOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @ApiProperty()
  code!: string;
}

export class RequestPhoneChangeDto {
  @IsPhoneNumber()
  @ApiProperty()
  phone!: string;
}

export class ConfirmPhoneChangeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @ApiProperty()
  code!: string;
}

export class AddEmailDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  @ApiProperty()
  email!: string;
}

export class AddPhoneDto {
  @IsPhoneNumber()
  @ApiProperty()
  phone!: string;
}

export class ConfirmIdentifierOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @ApiProperty()
  code!: string;
}

export class ConfirmIdentifierTokenDto {
  @IsString()
  @MinLength(20)
  @ApiProperty()
  token!: string;
}
