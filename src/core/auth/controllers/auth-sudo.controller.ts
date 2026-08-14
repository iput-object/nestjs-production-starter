import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { ServiceResponse } from '@/common/core/interceptors/response.interceptor';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import locals from '@/locals';
import {
  SudoOtpConfirmDto,
  SudoOtpRequestDto,
  SudoPasswordDto,
  SudoTwoFactorDto,
  SudoTwoFactorSendDto,
} from '@/core/auth/dto/request/sudo.dto';
import { SudoOptionsResponseDto } from '@/core/auth/dto/response/sudo-options.response.dto';
import { SudoStatusResponseDto } from '@/core/auth/dto/response/sudo-status.response.dto';
import { SudoService } from '@/core/auth/services/sudo.service';

@Controller('auth')
export class AuthSudoController {
  constructor(private readonly sudo: SudoService) {}

  @UseGuards(JwtAuthGuard)
  @Get('sudo')
  @ApiOperation({ summary: 'Check whether the current session has sudo' })
  @ApiOkResponse({ type: SudoStatusResponseDto })
  async getSudoStatus(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
  ) {
    const status = await this.sudo.status(userId, sessionId);
    return {
      data: plainToInstance(SudoStatusResponseDto, status, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sudo')
  @ApiOperation({ summary: 'Clear the current session sudo grant' })
  @ApiOkResponse()
  async clearSudo(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
  ): Promise<ServiceResponse<void>> {
    if (sessionId) {
      await this.sudo.clear(userId, sessionId);
    }
    return { message: locals.auth.sudo_cleared };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sudo/password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Elevate to sudo with account password' })
  @ApiOkResponse({ type: SudoStatusResponseDto })
  async elevateSudoWithPassword(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: SudoPasswordDto,
  ) {
    const grant = await this.sudo.elevateWithPassword(
      userId,
      sessionId,
      dto.password,
    );
    return {
      message: locals.auth.sudo_elevated,
      data: plainToInstance(
        SudoStatusResponseDto,
        {
          active: true,
          expiresAt: grant.expiresAt,
          method: grant.method,
        },
        { excludeExtraneousValues: true },
      ),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sudo/otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a sudo OTP to a primary email or phone' })
  @ApiOkResponse()
  async requestSudoOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: SudoOtpRequestDto,
  ): Promise<ServiceResponse<void>> {
    await this.sudo.requestOtp(userId, dto.channel);
    return { message: locals.auth.sudo_otp_sent };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sudo/otp/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Elevate to sudo with an OTP code' })
  @ApiOkResponse({ type: SudoStatusResponseDto })
  async confirmSudoOtp(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: SudoOtpConfirmDto,
  ) {
    const grant = await this.sudo.elevateWithOtp(
      userId,
      sessionId,
      dto.channel,
      dto.code,
    );
    return {
      message: locals.auth.sudo_elevated,
      data: plainToInstance(
        SudoStatusResponseDto,
        {
          active: true,
          expiresAt: grant.expiresAt,
          method: grant.method,
        },
        { excludeExtraneousValues: true },
      ),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sudo/2fa/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a sudo OTP to an enrolled email/SMS 2FA method',
  })
  @ApiOkResponse()
  async sendSudoTwoFactor(
    @CurrentUser('sub') userId: string,
    @Body() dto: SudoTwoFactorSendDto,
  ): Promise<ServiceResponse<void>> {
    await this.sudo.requestTwoFactorOtp(userId, dto.type);
    return { message: locals.auth.sudo_otp_sent };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sudo/2fa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Elevate to sudo with an enrolled 2FA method' })
  @ApiOkResponse({ type: SudoStatusResponseDto })
  async elevateSudoWithTwoFactor(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body() dto: SudoTwoFactorDto,
  ) {
    const grant = await this.sudo.elevateWithTwoFactor(
      userId,
      sessionId,
      dto.type,
      dto.code,
    );
    return {
      message: locals.auth.sudo_elevated,
      data: plainToInstance(
        SudoStatusResponseDto,
        {
          active: true,
          expiresAt: grant.expiresAt,
          method: grant.method,
        },
        { excludeExtraneousValues: true },
      ),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sudo/options')
  @ApiOperation({ summary: 'List available sudo elevation methods' })
  @ApiOkResponse({ type: SudoOptionsResponseDto })
  async listSudoOptions(@CurrentUser('sub') userId: string) {
    const methods = await this.sudo.listOptions(userId);
    return { data: SudoOptionsResponseDto.from(methods) };
  }
}
