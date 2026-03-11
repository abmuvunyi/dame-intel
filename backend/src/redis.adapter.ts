import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private ready = false;

  async connectToRedis(): Promise<void> {
    try {
      const pubClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: false
        }
      });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => console.log('Redis Pub Client Error:', err.message));
      subClient.on('error', (err) => console.log('Redis Sub Client Error:', err.message));

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.ready = true;
    } catch (e) {
      console.warn('Failed to connect to redis, falling back to memory adapter', e.message);
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
