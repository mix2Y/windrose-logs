import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, MemoryLeakSig } from '../lib/api'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function MemoryLeakDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [sig,     setSig]     = useState<MemoryLeakSig | null>(null)
  const [events,  setEvents]  = useState<any[]>([])
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.memoryLeaks.details(id, page)
      .then(r => { setSig(r.signature); setEvents(r.events) })
      .finally(() => setLoading(false))
  }, [id, page])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-3)', fontSize: 13 }}>
      <span className="animate-pulse">Loading…</span>
    </div>
  )
  if (!sig) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--red)', fontSize: 13 }}>
      Not found
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
        <Link to="/memory-leaks" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 14 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Memory Leaks
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {sig.conditionText}
            </h1>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--amber)', fontFamily: 'Geist Mono,monospace', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {sig.totalCount}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>occurrences</div>
          </div>
        </div>
        {/* Meta */}
        <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'FILES', value: sig.fileCount },
            { label: 'FIRST SEEN', value: fmtDate(sig.firstSeen) },
            { label: 'LAST SEEN',  value: fmtDate(sig.lastSeen) },
          ].map(m => (
            <div key={m.label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Geist Mono,monospace' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Events table */}
      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>Timestamp</th>
              <th style={{ textAlign: 'right' }}>Growth Rate (Mb/s)</th>
              <th>World</th>
              <th>File</th>
            </tr></thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)' }}>No events</td></tr>
              )}
              {events.map((e, i) => (
                <tr key={e.id} className="animate-fade-in" style={{ animationDelay: `${i * 15}ms` }}>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>{fmtDate(e.timestamp)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="badge badge-amber">{e.memoryGrowthRate?.toFixed(2) ?? '—'}</span>
                  </td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>{e.memoryWorld ?? '—'}</td>
                  <td>
                    <Link to={`/files/${e.file?.id}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 11, fontFamily: 'Geist Mono,monospace' }}>
                      {e.file?.fileName ?? '—'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {page > 1 && (
            <button className="btn btn-ghost" onClick={() => setPage(p => p - 1)} style={{ fontSize: 12 }}>← Prev</button>
          )}
          {events.length === 20 && (
            <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} style={{ fontSize: 12 }}>Next →</button>
          )}
        </div>
      </div>
    </div>
  )
}
