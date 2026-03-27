import { useEffect, useState } from 'react'
import { api, AdminUser, AdminStats } from '../lib/api'

function StatTile({ label, value, color = 'var(--text)' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: 'Geist Mono,monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

const ROLE_COLORS: Record<string, string> = { Admin: 'badge-amber', Reader: 'badge-blue' }

export function AdminPage() {
  const [stats, setStats]   = useState<AdminStats | null>(null)
  const [users, setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [requeuing, setRequeuing] = useState(false)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    Promise.all([api.admin.stats(), api.admin.users()])
      .then(([s, u]) => { setStats(s); setUsers(u) })
      .catch(() => setMsg({ text: 'Failed to load admin data', ok: false }))
      .finally(() => setLoading(false))
  }, [])

  async function handleRequeue() {
    setRequeuing(true)
    try {
      const r = await api.ingest.requeuePending()
      setMsg({ text: `Queued ${r.queued} pending files for parsing`, ok: true })
    } catch { setMsg({ text: 'Requeue failed', ok: false }) }
    finally { setRequeuing(false) }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(userId)
    try {
      await api.admin.setRole(userId, newRole)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      setMsg({ text: 'Role updated', ok: true })
    } catch { setMsg({ text: 'Failed to update role', ok: false }) }
    finally { setSaving(null) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-3)', fontSize: 13 }}>
      <span className="animate-pulse">Loading…</span>
    </div>
  )

  return (
    <div>
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text)' }}>Admin</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>System stats and user management</p>
        </div>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>
            {msg.ok ? '✓' : '✗'} {msg.text}
          </span>
        )}
        <button className="btn btn-ghost" onClick={handleRequeue} disabled={requeuing}
          style={{ fontSize: 12 }}>
          {requeuing ? '⟳ Queuing…' : '⟳ Requeue pending'}
        </button>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {/* Stats grid */}
        {stats && (
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 28 }}>
            <StatTile label="Files Total"  value={stats.filesTotal}      color="var(--text)" />
            <StatTile label="Files Done"   value={stats.filesDone}       color="var(--green)" />
            <StatTile label="Files Error"  value={stats.filesError}      color="var(--red)" />
            <StatTile label="Events Total" value={stats.eventsTotal.toLocaleString()} color="var(--amber)" />
            <StatTile label="Signatures"   value={stats.signaturesTotal} color="var(--blue)" />
            <StatTile label="Users"        value={stats.usersTotal}      color="var(--text)" />
            {stats.byEventType.map(et => (
              <StatTile key={et.eventType} label={et.eventType} value={et.count.toLocaleString()} />
            ))}
          </div>
        )}

        {/* Users table */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Users
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Login</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>No users yet</td></tr>
              )}
              {users.map((u, i) => (
                <tr key={u.id} className="animate-fade-in" style={{ animationDelay: `${i * 15}ms`, cursor: 'default' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--amber)', flexShrink: 0 }}>
                        {u.displayName?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{u.displayName}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>{u.email}</td>
                  <td><span className={`badge ${ROLE_COLORS[u.role] ?? 'badge-gray'}`}>{u.role}</span></td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {u.role !== 'Admin' && (
                        <button className="btn btn-ghost" disabled={saving === u.id}
                          onClick={() => handleRoleChange(u.id, 'Admin')}
                          style={{ fontSize: 11, padding: '3px 9px' }}>
                          → Admin
                        </button>
                      )}
                      {u.role !== 'Reader' && (
                        <button className="btn btn-ghost" disabled={saving === u.id}
                          onClick={() => handleRoleChange(u.id, 'Reader')}
                          style={{ fontSize: 11, padding: '3px 9px' }}>
                          → Reader
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
