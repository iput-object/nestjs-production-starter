import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Session } from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  deviceId?: string | null;
  deviceLabel?: string | null;
}

@Injectable()
export class SessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  create(input: CreateSessionInput): Promise<Session> {
    return this.prisma.session.create({
      data: {
        ...input,
        ipAddress: this.cls.get('ip') ?? null,
        userAgent: this.cls.get('userAgent') ?? null,
      },
    });
  }

  findActiveByHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.session.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  revokeByHash(refreshTokenHash: string): Promise<{ count: number }> {
    return this.prisma.session.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForUser(userId: string): Promise<{ count: number }> {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  listActiveForUser(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findActiveById(id: string): Promise<Session | null> {
    return this.prisma.session.findFirst({
      where: {
        id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  revokeById(id: string): Promise<{ count: number }> {
    return this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
