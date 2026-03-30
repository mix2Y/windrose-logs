import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, CrashEvent } from '../lib/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function CrashTypeBadge({ type }: { type: string | null }) {
  const t = type ?? 'Crash'
  const color = t === 'GPUCrash' ? 'var(--red)' : t === 'Assert' ? 'var(--amber)' : 'var(--red)'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: 'var(--red-bg,#fff1f1)',
      border: `1px solid ${color}30`, borderRadius: 4, padding: '2px 7px', fontFamily: 'Geist Mono,monospace' }}>
      {t}
    </span>
  )
}

const PAGE_SIZE = 50

export function CrashesPage() {
  const [items, setItems]   = useState<CrashEvent[]>([])
  const [total, setTotal]   = useState(0)
  const [page,  setPage]    = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [stats, setStats]   = useState<{ total: number; filesAffected: number; byType: { crashType: string; count: number }[] } | null>(null)
  const navigate = useNavigate()

  useEffect(() => { api.crashes.stats().then(setStats).catch(() => {}) }, [])

  const fetchPage = useCallback(async (p: number, sr: string, reset: boolean) => {
    setLoading(true)
    try {
      const r = await api.crashes.list({ page: p, pageSize: PAGE_SIZE, search: sr || undefined })
      setTotal(r.total)
      setItems(prev => reset ? r.items : [...prev, ...r.items])
      setHasMore(p * PAGE_SIZE < r.total)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPage(1, '', true) }, [])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    const next = page + 1
    setPage(next)
    fetchPage(next, search, false)
  }, [loading, hasMore, page, search])

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loading)

  function applySearch() { setPage(1); fetchPage(1, search, true) }

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em' }}>Crashes</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            {total > 0 ? `${items.length} / ${total} crash events` : 'Fatal errors & GPU crashes'}
          </p>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, alignItems: 'center', background: 'var(--bg-1)' }}>
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)', fontFamily: 'Geist Mono,monospace' }}>{stats.total}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>total crashes</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)', fontFamily: 'Geist Mono,monospace' }}>{stats.filesAffected}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>files affected</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.byType.map(t => (
              <span key={t.crashType} style={{ fontSize: 11, color: 'var(--text-2)' }}>
                <span style={{ fontWeight: 600, fontFamily: 'Geist Mono,monospace' }}>{t.crashType}</span>: {t.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg style={{ position: 'absolute', left: 8, color: 'var(--text-3)', pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="input" placeholder="Search crashes..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
            style={{ fontSize: 12, padding: '4px 8px 4px 26px', width: 240 }} />
          {search && <button onClick={() => { setSearch(''); fetchPage(1, '', true) }}
            style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>×</button>}
        </div>
        <button className="btn btn-primary" onClick={applySearch} style={{ fontSize: 11, padding: '4px 10px' }}>Apply</button>
      </div>

      {/* Table */}
      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>Crash Type</th>
              <th>Error Message</th>
              <th>Exit Reason</th>
              <th>File</th>
              <th>Uploader</th>
              <th style={{ textAlign: 'right' }}>Time</th>
            </tr></thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-3)' }}>
                  {search ? 'No crashes match search' : 'No crashes detected yet'}
                </td></tr>
              )}
              {items.map((c, i) => (
                <tr key={c.id} className="animate-fade-in"
                  style={{ animationDelay: `${Math.min(i, 20) * 15}ms`, cursor: 'pointer' }}
                  onClick={() => navigate(`/files/${c.fileId}`)}>
                  <td><CrashTypeBadge type={c.crashType} /></td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-2)' }}
                    title={c.errorMessage ?? ''}>
                    {c.errorMessage ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={c.exitReason ?? ''}>
                    {c.exitReason ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--blue)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.fileName}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.uploaderName ?? '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>
                      {new Date(c.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{timeAgo(c.timestamp)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div ref={sentinelRef} style={{ height: 20, marginTop: 8 }} />
        {loading && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-3)', fontSize: 12 }}><span className="animate-pulse">Loading…</span></div>}
        {!hasMore && items.length > 0 && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-3)', fontSize: 11 }}>All {total} crashes loaded</div>}
      </div>
    </div>
  )
}
