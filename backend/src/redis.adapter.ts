import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private ready = false;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    const subClient = pubClient.duplicate();

    // Setup error handlers so it doesn't crash the main thread if disconnected
    pubClient.on('error', (err) => console.log('Redis Pub Client Error:', err));
    subClient.on('error', (err) => console.log('Redis Sub Client Error:', err));

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.ready = true;
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
