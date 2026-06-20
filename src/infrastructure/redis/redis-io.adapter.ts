import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';
import { RedisAdapter } from '@/infrastructure/redis/redis.adapter';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private subClient?: Redis;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisAdapter = this.app.get(RedisAdapter);
    const pubClient = await redisAdapter.getClient();
    this.subClient = pubClient.duplicate();
    await this.subClient.connect();

    this.adapterConstructor = createAdapter(pubClient, this.subClient);
    this.logger.log('Redis WebSocket adapter enabled');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }

  async close(): Promise<void> {
    if (!this.subClient) {
      return;
    }

    await this.subClient.quit();
    this.subClient = undefined;
  }
}
