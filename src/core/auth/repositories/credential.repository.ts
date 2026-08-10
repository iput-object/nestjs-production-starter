import { Injectable } from '@nestjs/common';
import type { Credential } from '@prisma-client';
import type { AuthProviderValue } from '@/core/auth/constants/auth-provider.constants';
import { PrismaService } from '@/database/prisma.service';

export interface CreateCredentialInput {
  userId: string;
  provider: AuthProviderValue;
  providerId: string;
  passwordHash?: string | null;
}

@Injectable()
export class CredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProviderIdentity(
    provider: AuthProviderValue,
    providerId: string,
  ): Promise<Credential | null> {
    return this.prisma.credential.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
  }

  findByUserAndProvider(
    userId: string,
    provider: AuthProviderValue,
  ): Promise<Credential | null> {
    return this.prisma.credential.findUnique({
      where: { userId_provider: { userId, provider } },
    });
  }

  create(input: CreateCredentialInput): Promise<Credential> {
    return this.prisma.credential.create({ data: input });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<Credential> {
    return this.prisma.credential.update({
      where: { id },
      data: { passwordHash },
    });
  }

  updateProviderId(id: string, providerId: string): Promise<Credential> {
    return this.prisma.credential.update({
      where: { id },
      data: { providerId },
    });
  }

  delete(id: string): Promise<Credential> {
    return this.prisma.credential.delete({ where: { id } });
  }

  listForUser(userId: string): Promise<Credential[]> {
    return this.prisma.credential.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  touchLastUsed(id: string): Promise<Credential> {
    return this.prisma.credential.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }
}
