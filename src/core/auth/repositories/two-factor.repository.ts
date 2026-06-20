import { Injectable } from '@nestjs/common';
import type { TwoFactorBackupCode, TwoFactorMethod } from '@prisma-client';
import type { TwoFactorMethodType } from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';

export interface UpsertMethodInput {
  userId: string;
  type: TwoFactorMethodType;
  secret?: string | null;
  destination?: string | null;
}

@Injectable()
export class TwoFactorRepository {
  constructor(private readonly prisma: PrismaService) {}

  listMethodsForUser(userId: string): Promise<TwoFactorMethod[]> {
    return this.prisma.twoFactorMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  findEnabledForUser(userId: string): Promise<TwoFactorMethod[]> {
    return this.prisma.twoFactorMethod.findMany({
      where: { userId, isEnabled: true },
    });
  }

  findById(id: string): Promise<TwoFactorMethod | null> {
    return this.prisma.twoFactorMethod.findUnique({ where: { id } });
  }

  findByUserAndType(
    userId: string,
    type: TwoFactorMethodType,
  ): Promise<TwoFactorMethod | null> {
    return this.prisma.twoFactorMethod.findUnique({
      where: { userId_type: { userId, type } },
    });
  }

  upsert(input: UpsertMethodInput): Promise<TwoFactorMethod> {
    const { userId, type, secret = null, destination = null } = input;
    return this.prisma.twoFactorMethod.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, secret, destination },
      update: { secret, destination, isEnabled: false, verifiedAt: null },
    });
  }

  enable(id: string): Promise<TwoFactorMethod> {
    return this.prisma.twoFactorMethod.update({
      where: { id },
      data: { isEnabled: true, verifiedAt: new Date() },
    });
  }

  touchLastUsed(id: string): Promise<TwoFactorMethod> {
    return this.prisma.twoFactorMethod.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  delete(id: string): Promise<TwoFactorMethod> {
    return this.prisma.twoFactorMethod.delete({ where: { id } });
  }

  // ---------- Backup codes (per-user) ----------
  replaceBackupCodes(
    userId: string,
    codeHashes: string[],
  ): Promise<TwoFactorBackupCode[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
      if (codeHashes.length === 0) return [];
      await tx.twoFactorBackupCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      });
      return tx.twoFactorBackupCode.findMany({ where: { userId } });
    });
  }

  findBackupCode(
    userId: string,
    codeHash: string,
  ): Promise<TwoFactorBackupCode | null> {
    return this.prisma.twoFactorBackupCode.findFirst({
      where: { userId, codeHash, usedAt: null },
    });
  }

  consumeBackupCode(id: string): Promise<TwoFactorBackupCode> {
    return this.prisma.twoFactorBackupCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  countUnusedBackupCodes(userId: string): Promise<number> {
    return this.prisma.twoFactorBackupCode.count({
      where: { userId, usedAt: null },
    });
  }

  async clearBackupCodes(userId: string): Promise<void> {
    await this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
  }
}
