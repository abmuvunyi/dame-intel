import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './audit-log.entity';

describe('AuditService', () => {
  let audit: AuditService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [AuditLog], synchronize: true }),
        TypeOrmModule.forFeature([AuditLog]),
      ],
      providers: [AuditService],
    }).compile();
    audit = module.get(AuditService);
  });

  it('records who did what to whom, from where', async () => {
    await audit.record({
      action: 'roles.changed', actorUserId: 1, targetType: 'user', targetId: 42,
      details: { before: [], after: ['MODERATOR'] }, req: { ip: '203.0.113.9', id: 'req-1' },
    });
    const { items, total } = await audit.list({});
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      action: 'roles.changed', actorType: 'USER', actorUserId: 1, targetType: 'user', targetId: '42',
      ip: '203.0.113.9', requestId: 'req-1', details: { before: [], after: ['MODERATOR'] },
    });
  });

  it('never stores secrets, even if a caller passes them', async () => {
    await audit.record({ action: 'x', details: { password: 'hunter2', apiToken: 'abc', card: '4242', ok: 1 } });
    const { items } = await audit.list({});
    expect(items[0].details).toEqual({ password: '[redacted]', apiToken: '[redacted]', card: '[redacted]', ok: 1 });
  });

  it('filters and paginates, newest first', async () => {
    for (let i = 0; i < 5; i++) await audit.record({ action: i % 2 ? 'a' : 'b', targetType: 'user', targetId: i });
    const onlyA = await audit.list({ action: 'a' });
    expect(onlyA.total).toBe(2);
    const page = await audit.list({ page: 2, pageSize: 2 });
    expect(page.items.map((r) => r.targetId)).toEqual(['2', '1']);
  });

  it('a failure to write never breaks the caller', async () => {
    (audit as any).repo.insert = jest.fn().mockRejectedValue(new Error('db down'));
    jest.spyOn((audit as any).logger, 'error').mockImplementation(() => {});
    await expect(audit.record({ action: 'x' })).resolves.toBeUndefined();
  });
});
