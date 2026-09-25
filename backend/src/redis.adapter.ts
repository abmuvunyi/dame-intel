import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const logger = new Logger('RedisIoAdapter');

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private ready = false;

  async connectToRedis(): Promise<void> {
    try {
      if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
        return; // not configured: in-memory adapter, no connection attempt
      }
      // Fail fast on the INITIAL connection (so boot falls back to the in-memory
      // adapter quickly), but once connected, reconnect with backoff (Phase 14) —
      // previously a single Redis blip permanently broke cross-instance fan-out.
      let connected = false;
      const pubClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries: number) => (connected ? Math.min(retries * 200, 5000) : false),
        },
      });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => logger.error(`Redis Pub Client Error: ${err.message}`));
      subClient.on('error', (err) => logger.error(`Redis Sub Client Error: ${err.message}`));

      await Promise.all([pubClient.connect(), subClient.connect()]);
      connected = true;

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.ready = true;
    } catch (e) {
      logger.warn(`Failed to connect to Redis (${(e as Error).message}); falling back to the in-memory adapter.`);
    }
  }

  isReady(): boolean {
      return this.ready;
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.ready) {
       server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
