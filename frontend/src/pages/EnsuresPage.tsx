import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, EnsureEvent } from '../lib/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

const PAGE_SIZE = 50

export function EnsuresPage() {
  const [items,   setItems]   = useState<EnsureEvent[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const [stats,   setStats]   = useState<{ total: number; filesAffected: number; unique: number } | null>(null)
  const navigate = useNavigate()

  useEffect(() => { api.ensures.stats().then(setStats).catch(() => {}) }, [])

  const fetchPage = useCallback(async (p: number, sr: string, reset: boolean) => {
    setLoading(true)
    try {
      const r = await api.ensures.list({ page: p, pageSize: PAGE_SIZE, search: sr || undefined })
      setTotal(r.total)
      setItems(prev => reset ? r.items : [...prev, ...r.items])
      setHasMore(p * PAGE_SIZE < r.total)
    } catch { /**/ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPage(1, '', true) }, [])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    const next = page + 1; setPage(next); fetchPage(next, search, false)
  }, [loading, hasMore, page, search])

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loading)
  function applySearch() { setPage(1); fetchPage(1, search, true) }

  return (
    <div>
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em' }}>R5 Ensures</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            {total > 0 ? `${items.length} / ${total} events` : 'Ensure condition failures'}
          </p>
        </div>
      </div>

      {stats && (
        <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, alignItems: 'center', background: 'var(--bg-1)' }}>
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)', fontFamily: 'Geist Mono,monospace' }}>{stats.total}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>total ensures</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'Geist Mono,monospace' }}>{stats.filesAffected}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>files affected</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)', fontFamily: 'Geist Mono,monospace' }}>{stats.unique}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>unique (1 раз)</span>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg style={{ position: 'absolute', left: 8, color: 'var(--text-3)', pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="input" placeholder="Search ensures..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
            style={{ fontSize: 12, padding: '4px 8px 4px 26px', width: 240 }} />
          {search && <button onClick={() => { setSearch(''); fetchPage(1, '', true) }}
            style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>×</button>}
        </div>
        <button className="btn btn-primary" onClick={applySearch} style={{ fontSize: 11, padding: '4px 10px' }}>Apply</button>
      </div>

      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>Condition</th>
              <th>User Message</th>
              <th>Function</th>
              <th>File</th>
              <th>Uploader</th>
              <th style={{ textAlign: 'right' }}>Time</th>
            </tr></thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-3)' }}>
                  {search ? 'No ensures match search' : 'No R5Ensure events detected yet'}
                </td></tr>
              )}
              {items.map((e, i) => (
                <tr key={e.id} className="animate-fade-in"
                  style={{ animationDelay: `${Math.min(i, 20) * 15}ms`, cursor: 'pointer' }}
                  onClick={() => navigate(`/files/${e.fileId}`)}>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 12, color: 'var(--amber)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.condition ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.userMessage ?? ''}>
                    {e.userMessage ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.function ?? ''}>
                    {e.function ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.file ? e.file.split('\\').pop() : '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.uploaderName ?? '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>
                      {new Date(e.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{timeAgo(e.timestamp)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div ref={sentinelRef} style={{ height: 20, marginTop: 8 }} />
        {loading && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-3)', fontSize: 12 }}><span className="animate-pulse">Loading…</span></div>}
        {!hasMore && items.length > 0 && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-3)', fontSize: 11 }}>All {total} ensures loaded</div>}
      </div>
    </div>
  )
}
