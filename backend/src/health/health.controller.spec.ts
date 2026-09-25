import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('live() never touches the database', () => {
    const ds: any = { query: jest.fn() };
    expect(new HealthController(ds).live()).toEqual({ status: 'ok' });
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('ready() reports ok when the database answers', async () => {
    const ds: any = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const res = await new HealthController(ds).ready();
    expect(res.status).toBe('ok');
    expect(res.checks.database).toBe('up');
  });

  it('ready() returns 503 when the database is unreachable', async () => {
    const ds: any = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    await expect(new HealthController(ds).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
