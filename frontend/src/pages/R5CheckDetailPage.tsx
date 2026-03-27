import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, EventDetail, SignatureSummary } from '../lib/api'

export function R5CheckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [signature, setSignature] = useState<SignatureSummary | null>(null)
  const [events, setEvents]   = useState<EventDetail[]>([])
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.r5checks.details(id, page)
      .then(r => { setSignature(r.signature); setEvents(r.events) })
      .finally(() => setLoading(false))
  }, [id, page])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-3)', fontSize: 13 }}><span className="animate-pulse">Loading…</span></div>
  if (!signature) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--red)', fontSize: 13 }}>Signature not found</div>

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
        <Link to="/r5checks" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 14 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to R5 Checks
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <span className="badge badge-red">R5Check</span>
              {signature.sourceFile && <span style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)' }}>{signature.sourceFile}</span>}
            </div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: 'var(--amber)', fontFamily: 'Geist Mono,monospace', letterSpacing: '-0.01em' }}>
              '{signature.conditionText}'
            </h1>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--red)', fontFamily: 'Geist Mono,monospace', lineHeight: 1, letterSpacing: '-0.03em' }}>{signature.totalCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>occurrences</div>
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {[
          { label: 'WHERE',      value: signature.whereText, mono: true },
          { label: 'FIRST SEEN', value: new Date(signature.firstSeen).toLocaleString() },
          { label: 'LAST SEEN',  value: new Date(signature.lastSeen).toLocaleString() },
          { label: 'FILES',      value: `${signature.fileCount} file${signature.fileCount !== 1 ? 's' : ''}` },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: mono ? 'Geist Mono,monospace' : undefined, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          All Occurrences
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {events.map((ev, i) => (
            <div key={ev.id} className="card animate-fade-in" style={{ overflow: 'hidden', animationDelay: `${i * 18}ms` }}>
              <button onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontFamily: 'inherit', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
                <span className="badge badge-gray">f{ev.frameNumber}</span>
                {ev.checkMessage && <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{ev.checkMessage}</span>}
                <span style={{ fontSize: 11, color: 'var(--blue)', fontFamily: 'Geist Mono,monospace', flexShrink: 0, marginLeft: 'auto' }}>{ev.file.fileName}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"
                  style={{ flexShrink: 0, transform: expandedId === ev.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {expandedId === ev.id && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', padding: 14 }}>
                  {ev.checkMessage && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 5 }}>MESSAGE</div>
                      <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--amber)', background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)', borderRadius: 5, padding: '8px 10px', wordBreak: 'break-all', lineHeight: 1.6 }}>{ev.checkMessage}</div>
                    </div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 5 }}>CALLSTACK</div>
                  <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '10px 12px', maxHeight: 210, overflowY: 'auto', lineHeight: 1.9 }}>
                    {ev.callstack.map((line, j) => (
                      <div key={j} style={{ color: j === 0 ? 'var(--text)' : 'var(--text-3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={e => (e.currentTarget.style.color = j === 0 ? 'var(--text)' : 'var(--text-3)')}>
                        {line.replace('[Callstack] ', '')}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize: 12 }}>← Prev</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-3)', fontFamily: 'Geist Mono,monospace', padding: '0 8px' }}>Page {page}</span>
          <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={events.length < 20} style={{ fontSize: 12 }}>Next →</button>
        </div>
      </div>
    </div>
  )
}
