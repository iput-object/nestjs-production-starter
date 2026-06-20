import { Injectable } from '@nestjs/common';
import type { AuthProvider, Role, User, UserStatus } from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';
import type { AuthUser } from '@/core/auth/types/auth-user.type';

export interface CreateUserInput {
  email?: string | null;
  phone?: string | null;
  role?: Role;
  status?: UserStatus;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
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
        email: true,
        role: true,
        profile: { select: { name: true, avatarUrl: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.profile?.name ?? null,
      avatar: row.profile?.avatarUrl ?? null,
      email: row.email,
      role: row.role,
    };
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, isDeleted: false },
    });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { phone, isDeleted: false },
    });
  }

  findByProviderIdentity(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        isDeleted: false,
        credentials: { some: { provider, providerId } },
      },
    });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  markEmailVerified(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isEmailVerified: true },
    });
  }

  markPhoneVerified(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isPhoneVerified: true },
    });
  }

  updateEmail(id: string, email: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { email, isEmailVerified: false },
    });
  }

  updatePhone(id: string, phone: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { phone, isPhoneVerified: false },
    });
  }
}
