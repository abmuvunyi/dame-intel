'use client';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { API_BASE } from '@/lib/api';

// Phase 15: staff administration — who holds which role, and the audit trail.
// Every call is permission-checked by the backend; this page only reflects it.

interface RoleInfo {
  role: string;
  description: string;
  permissions: string[];
}

interface UserSummary {
  id: number;
  username: string;
  roles: string[];
  plan: string;
  planSource: string;
  moderationStatus: string;
  createdAt: string;
}

interface AuditItem {
  id: number;
  createdAt: string;
  actorType: string;
  actorUserId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  ORGANIZER: 'Organizer',
  CONTENT_EDITOR: 'Content editor',
};

export default function AdminPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [tab, setTab] = useState<'people' | 'audit'>('people');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    axios
      .get(`${API_BASE}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const perms: string[] = res.data.permissions ?? [];
        setPermissions(perms);
        if (!perms.includes('users.read') && perms.includes('audit.read')) setTab('audit');
      })
      .catch(() => router.push('/login'));
  }, [router]);

  const canReadUsers = permissions?.includes('users.read');
  const canReadAudit = permissions?.includes('audit.read');

  return (
    <DashboardShell>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-6">Admin</h1>
        {error && <div className="mb-4 p-4 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">{error}</div>}
        {permissions === null ? (
          <p className="text-slate-400">Loading...</p>
        ) : !canReadUsers && !canReadAudit ? (
          <p className="text-slate-300">You don&apos;t have access to staff administration.</p>
        ) : (
          <>
            <div className="flex gap-2 mb-6 border-b border-slate-700" role="tablist">
              {canReadUsers && (
                <button role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}
                  className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${tab === 'people' ? 'border-green-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                  Staff &amp; roles
                </button>
              )}
              {canReadAudit && (
                <button role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}
                  className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${tab === 'audit' ? 'border-green-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                  Audit trail
                </button>
              )}
            </div>
            {tab === 'people' && canReadUsers && (
              <PeopleTab canManage={!!permissions.includes('roles.manage')} onError={setError} />
            )}
            {tab === 'audit' && canReadAudit && <AuditTab onError={setError} />}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

function PeopleTab({ canManage, onError }: { canManage: boolean; onError: (e: string | null) => void }) {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [staff, setStaff] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const loadStaff = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        axios.get<RoleInfo[]>(`${API_BASE}/admin/roles`, auth()),
        axios.get<UserSummary[]>(`${API_BASE}/admin/staff`, auth()),
      ]);
      setRoles(r.data);
      setStaff(s.data);
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Could not load staff.');
    }
  }, [onError]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.get<UserSummary[]>(`${API_BASE}/admin/users`, { ...auth(), params: { search } });
      setResults(res.data);
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Search failed.');
    }
  };

  const toggleRole = async (user: UserSummary, role: string) => {
    const next = user.roles.includes(role) ? user.roles.filter((r) => r !== role) : [...user.roles, role];
    if (!window.confirm(`Change ${user.username}'s roles to: ${next.map((r) => ROLE_LABELS[r] ?? r).join(', ') || 'none (player)'}?\nThis signs them out everywhere.`)) return;
    setSaving(user.id);
    onError(null);
    try {
      const res = await axios.put<UserSummary>(`${API_BASE}/admin/users/${user.id}/roles`, { roles: next }, auth());
      setResults((rs) => rs?.map((u) => (u.id === user.id ? res.data : u)) ?? rs);
      await loadStaff();
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Could not change roles.');
    } finally {
      setSaving(null);
    }
  };

  const table = (rows: UserSummary[]) => (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-slate-400 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Player</th>
            <th className="px-3 py-2 font-medium">Plan</th>
            {roles.map((r) => (
              <th key={r.role} className="px-3 py-2 font-medium text-center" title={r.description}>{ROLE_LABELS[r.role] ?? r.role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-slate-700/60 text-slate-200">
              <td className="px-3 py-2">
                {u.username}
                {u.moderationStatus !== 'NONE' && <span className="ml-2 text-xs text-orange-300">{u.moderationStatus}</span>}
              </td>
              <td className="px-3 py-2 text-slate-400">{u.plan}{u.planSource === 'TRIAL' ? ' (trial)' : ''}</td>
              {roles.map((r) => (
                <td key={r.role} className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${ROLE_LABELS[r.role] ?? r.role} role for ${u.username}`}
                    checked={u.roles.includes(r.role)}
                    disabled={!canManage || saving === u.id}
                    onChange={() => toggleRole(u, r.role)}
                    className="h-4 w-4 accent-green-600"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Roles</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <li key={r.role} className="p-3 rounded-lg bg-slate-800 border border-slate-700">
              <p className="font-medium text-slate-100">{ROLE_LABELS[r.role] ?? r.role}</p>
              <p className="text-sm text-slate-400">{r.description}</p>
            </li>
          ))}
        </ul>
        {!canManage && <p className="text-xs text-slate-500 mt-2">Only admins can change roles.</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Current staff</h2>
        {staff.length === 0 ? <p className="text-slate-400 text-sm">No staff yet.</p> : table(staff)}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Find a player</h2>
        <form onSubmit={runSearch} className="flex gap-2 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Username"
            aria-label="Search by username"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-500">Search</button>
        </form>
        {results && (results.length === 0 ? <p className="text-slate-400 text-sm">No players found.</p> : table(results))}
      </section>
    </div>
  );
}

function AuditTab({ onError }: { onError: (e: string | null) => void }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const pageSize = 50;

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/audit`, { ...auth(), params: { page, pageSize, ...(action ? { action } : {}) } });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Could not load the audit trail.');
    }
  }, [page, action, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <label className="text-sm text-slate-400" htmlFor="audit-action">Action</label>
        <select
          id="audit-action"
          value={action}
          onChange={(e) => { setPage(1); setAction(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm"
        >
          <option value="">All</option>
          {['roles.changed', 'moderation.action', 'subscription.changed', 'subscription.checkout_started', 'trial.started', 'trial.ended',
            'auth.login_failed', 'auth.login_blocked_banned', 'auth.registered', 'tournament.created', 'puzzle.approved', 'puzzle.rejected',
            'puzzle.premium_changed', 'subscription.unknown_price'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-sm text-slate-500 ml-auto">{total} events</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">When (UTC)</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Details</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-slate-700/60 text-slate-200 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-slate-400">{new Date(i.createdAt).toISOString().replace('T', ' ').slice(0, 19)}</td>
                <td className="px-3 py-2 font-mono text-xs">{i.action}</td>
                <td className="px-3 py-2">{i.actorType}{i.actorUserId ? ` #${i.actorUserId}` : ''}</td>
                <td className="px-3 py-2">{i.targetType ? `${i.targetType} #${i.targetId}` : '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400 max-w-md break-words">{i.details ? JSON.stringify(i.details) : ''}</td>
                <td className="px-3 py-2 text-slate-500">{i.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center mt-3 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded border border-slate-700 text-slate-300 disabled:opacity-40">Newer</button>
        <span className="text-slate-500">Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded border border-slate-700 text-slate-300 disabled:opacity-40">Older</button>
      </div>
    </div>
  );
}
