import { Injectable } from '@nestjs/common';
import type { Role, User } from '@prisma-client';
import { IdentifierType, UserStatus } from '@prisma-client';
import type { AuthProviderValue } from '@/core/auth/constants/auth-provider.constants';
import { PrismaService } from '@/database/prisma.service';
import type { AuthUser } from '@/core/auth/types/auth-user.type';

export interface CreateUserInput {
  role?: Role;
  status?: UserStatus;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, isDeleted: false },
    });
  }

  async findAuthUser(id: string): Promise<AuthUser | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        role: true,
        profile: { select: { name: true, avatarUrl: true } },
        identifiers: {
          where: {
            type: { in: [IdentifierType.EMAIL, IdentifierType.PHONE] },
            isPrimary: true,
          },
          select: { type: true, value: true, isVerified: true },
        },
      },
    });
    if (!row) return null;
    const email = row.identifiers.find((i) => i.type === IdentifierType.EMAIL);
    const phone = row.identifiers.find((i) => i.type === IdentifierType.PHONE);
    return {
      id: row.id,
      name: row.profile?.name ?? null,
      avatar: row.profile?.avatarUrl ?? null,
      phone: phone?.value ?? null,
      email: email?.value ?? null,
      role: row.role,
      isAccountVerified: Boolean(email?.isVerified || phone?.isVerified),
    };
  }

  findByProviderIdentity(
    provider: AuthProviderValue,
    providerId: string,
  ): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        isDeleted: false,
        credentials: { some: { provider, providerId } },
      },
    });
  }

  create(input: CreateUserInput = {}): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  softDelete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: UserStatus.SUSPENDED,
      },
    });
  }

  findByIdIncludingDeleted(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  updateStatus(id: string, status: UserStatus, reason?: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { status, reason: reason ?? null },
    });
  }
}
