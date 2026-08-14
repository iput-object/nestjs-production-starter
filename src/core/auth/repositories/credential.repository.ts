import { Injectable } from '@nestjs/common';
import { Prisma, type Credential } from '@prisma-client';
import type { AuthProviderValue } from '@/core/auth/constants/auth-provider.constants';
import { mapPrismaSerializationFailure } from '@/common/utils/prisma-error.util';
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

  /**
   * Delete an OAuth credential only when another login method remains.
   * Runs in a serializable transaction so parallel unlinks cannot both pass.
   * Returns false when the credential is missing or would be the last method.
   */
  async deleteOAuthIfNotLastLogin(
    userId: string,
    credentialId: string,
  ): Promise<'deleted' | 'missing' | 'last'> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const credential = await tx.credential.findFirst({
            where: { id: credentialId, userId },
          });
          if (!credential) {
            return 'missing';
          }
          if (
            credential.provider !== 'GOOGLE' &&
            credential.provider !== 'APPLE'
          ) {
            return 'missing';
          }

          const others = await tx.credential.findMany({
            where: { userId, id: { not: credentialId } },
          });
          const hasPassword = others.some(
            (row) => row.provider === 'EMAIL' && Boolean(row.passwordHash),
          );
          const otherOauth = others.some(
            (row) => row.provider === 'GOOGLE' || row.provider === 'APPLE',
          );
          if (!hasPassword && !otherOauth) {
            return 'last';
          }

          await tx.credential.delete({ where: { id: credentialId } });
          return 'deleted';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      return mapPrismaSerializationFailure(err, 'last');
    }
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
