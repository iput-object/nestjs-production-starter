import { Injectable } from '@nestjs/common';
import { IdentifierType, Prisma, type User, type UserIdentifier } from '@prisma-client';
import { mapPrismaSerializationFailure } from '@/common/utils/prisma-error.util';
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
    const verifiedPrimary = await this.prisma.userIdentifier.count({
      where: {
        userId,
        isPrimary: true,
        isVerified: true,
        type: { in: [IdentifierType.EMAIL, IdentifierType.PHONE] },
      },
    });
    return verifiedPrimary > 0;
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
   * Delete a non-primary identifier only when it is not the last verified
   * recovery method. Serializable so parallel removes cannot both pass.
   */
  async deleteIfNotLastVerifiedRecovery(
    userId: string,
    identifierId: string,
  ): Promise<'deleted' | 'missing' | 'primary' | 'last'> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const identifier = await tx.userIdentifier.findFirst({
            where: { id: identifierId, userId },
          });
          if (!identifier) {
            return 'missing';
          }
          if (identifier.isPrimary) {
            return 'primary';
          }

          if (identifier.isVerified) {
            const verifiedCount = await tx.userIdentifier.count({
              where: { userId, isVerified: true },
            });
            if (verifiedCount <= 1) {
              return 'last';
            }
          }

          await tx.userIdentifier.delete({ where: { id: identifierId } });
          return 'deleted';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      return mapPrismaSerializationFailure(err, 'last');
    }
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
