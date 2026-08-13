import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty()
  currentPassword!: string;
}

export class RequestEmailChangeDto extends StepUpPasswordDto {
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

export class RequestPhoneChangeDto extends StepUpPasswordDto {
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

export class AddEmailDto extends StepUpPasswordDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  @ApiProperty()
  email!: string;
}

export class AddPhoneDto extends StepUpPasswordDto {
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

export class IdentifierActionDto extends StepUpPasswordDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  reason?: string;
}
