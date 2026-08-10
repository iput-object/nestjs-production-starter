import { Injectable } from '@nestjs/common';
import type { User, UserIdentifier } from '@prisma-client';
import { IdentifierType } from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';

export interface CreateIdentifierInput {
  userId: string;
  type: IdentifierType;
  value: string;
  isPrimary?: boolean;
  isVerified?: boolean;
}

export type IdentifierOwner = {
  identifier: UserIdentifier;
  user: User;
};

@Injectable()
export class IdentifierRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string): Promise<UserIdentifier[]> {
    return this.prisma.userIdentifier.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  listVerifiedForUser(userId: string): Promise<UserIdentifier[]> {
    return this.prisma.userIdentifier.findMany({
      where: { userId, isVerified: true },
      orderBy: [{ type: 'asc' }, { isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string): Promise<UserIdentifier | null> {
    return this.prisma.userIdentifier.findUnique({ where: { id } });
  }

  findByTypeValue(
    type: IdentifierType,
    value: string,
  ): Promise<UserIdentifier | null> {
    return this.prisma.userIdentifier.findUnique({
      where: { type_value: { type, value } },
    });
  }

  async findActiveOwner(
    type: IdentifierType,
    value: string,
  ): Promise<IdentifierOwner | null> {
    const identifier = await this.prisma.userIdentifier.findUnique({
      where: { type_value: { type, value } },
      include: { user: true },
    });
    if (!identifier || identifier.user.isDeleted) {
      return null;
    }
    return { identifier, user: identifier.user };
  }

  findPrimary(
    userId: string,
    type: IdentifierType,
  ): Promise<UserIdentifier | null> {
    return this.prisma.userIdentifier.findFirst({
      where: { userId, type, isPrimary: true },
    });
  }

  countVerifiedForUser(userId: string): Promise<number> {
    return this.prisma.userIdentifier.count({
      where: { userId, isVerified: true },
    });
  }

  async isAccountVerified(userId: string): Promise<boolean> {
    return this.hasVerifiedPrimaryEmail(userId);
  }

  async hasVerifiedPrimaryEmail(userId: string): Promise<boolean> {
    const primary = await this.findPrimary(userId, IdentifierType.EMAIL);
    return Boolean(primary?.isVerified);
  }

  create(input: CreateIdentifierInput): Promise<UserIdentifier> {
    return this.prisma.userIdentifier.create({
      data: {
        userId: input.userId,
        type: input.type,
        value: input.value,
        isPrimary: input.isPrimary ?? false,
        isVerified: input.isVerified ?? false,
        verifiedAt: input.isVerified ? new Date() : null,
      },
    });
  }

  markVerified(id: string): Promise<UserIdentifier> {
    return this.prisma.userIdentifier.update({
      where: { id },
      data: { isVerified: true, verifiedAt: new Date() },
    });
  }

  async setPrimary(userId: string, id: string): Promise<UserIdentifier> {
    const target = await this.findById(id);
    if (!target || target.userId !== userId) {
      throw new Error('identifier_not_found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.userIdentifier.updateMany({
        where: { userId, type: target.type, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.userIdentifier.update({
        where: { id },
        data: { isPrimary: true },
      });
    });
  }

  delete(id: string): Promise<UserIdentifier> {
    return this.prisma.userIdentifier.delete({ where: { id } });
  }

  /**
   * Soft-reclaim: delete identifiers whose owning user was soft-deleted
   * before the grace cutoff so the value can be registered again.
   */
  async reclaimOrphaned(graceCutoff: Date): Promise<number> {
    const result = await this.prisma.userIdentifier.deleteMany({
      where: {
        user: {
          isDeleted: true,
          deletedAt: { lte: graceCutoff },
        },
      },
    });
    return result.count;
  }
}
