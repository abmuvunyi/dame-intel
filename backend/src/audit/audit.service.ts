import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { errorDetail } from '../common/error-detail';

export interface AuditEntry {
  action: string;
  actorType?: 'USER' | 'SYSTEM' | 'STRIPE' | 'CLI';
  actorUserId?: number | null;
  targetType?: string | null;
  targetId?: string | number | null;
  details?: Record<string, unknown> | null;
  /** Express request, to capture client IP and request id. */
  req?: { ip?: string; id?: unknown } | null;
}

export interface AuditQuery {
  action?: string;
  actorUserId?: number;
  targetType?: string;
  targetId?: string;
  page?: number;
  pageSize?: number;
}

// Keys that must never reach the audit log even if a caller passes them by mistake.
const REDACT = /pass(word)?|secret|token|authorization|card|cvc|iban/i;

function redact(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  return Object.fromEntries(Object.entries(details).map(([k, v]) => [k, REDACT.test(k) ? '[redacted]' : v]));
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /**
   * Records an audit event. Never throws: a failure to write the audit row is logged
   * loudly but must not break the user-facing action that triggered it.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.insert({
        action: entry.action,
        actorType: entry.actorType ?? (entry.actorUserId ? 'USER' : 'SYSTEM'),
        actorUserId: entry.actorUserId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId === undefined || entry.targetId === null ? null : String(entry.targetId),
        details: redact(entry.details) as any,
        ip: entry.req?.ip ?? null,
        requestId: typeof entry.req?.id === 'string' || typeof entry.req?.id === 'number' ? String(entry.req.id) : null,
      });
    } catch (err) {
      this.logger.error(`Failed to write audit event ${entry.action}: ${errorDetail(err)}`);
    }
  }

  async list(query: AuditQuery): Promise<{ items: AuditLog[]; total: number; page: number; pageSize: number }> {
    const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
    const page = Math.max(query.page ?? 1, 1);
    const where: Record<string, unknown> = {};
    if (query.action) where.action = query.action;
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }
}
