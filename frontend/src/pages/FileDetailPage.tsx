import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, LogFileDto, SignatureSummary } from '../lib/api'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string>    = { done: 'badge-green', error: 'badge-red', processing: 'badge-blue', pending: 'badge-gray' }
  const labels: Record<string, string> = { done: '✓ done', error: '✗ error', processing: '⟳ processing', pending: '· pending' }
  return <span className={`badge ${map[status] ?? 'badge-gray'}`}>{labels[status] ?? status}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: mono ? 'Geist Mono,monospace' : undefined }}>{value}</div>
    </div>
  )
}

export function FileDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [file, setFile]       = useState<LogFileDto | null>(null)
  const [counts, setCounts]   = useState<{ eventType: string; count: number }[]>([])
  const [sigs, setSigs]       = useState<(SignatureSummary & { fileCount: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    api.files.details(id)
      .then(r => {
        const f = r.file ?? (r as any).File
        setFile(f)
        setCounts(r.eventCounts ?? [])
        setSigs(r.topSignatures ?? [])
      })
      .catch(e => {
        const msg = String(e)
        // If unauthenticated — redirect to root so MSAL can re-auth
        if (msg.includes('401') || msg.includes('Not authenticated')) {
          window.location.href = '/'
          return
        }
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-3)', fontSize: 13 }}>
      <span className="animate-pulse">Loading…</span>
    </div>
  )
  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 8 }}>
      <span style={{ color: 'var(--red)', fontSize: 13 }}>Failed to load file</span>
      <span style={{ color: 'var(--text-3)', fontSize: 11, fontFamily: 'Geist Mono,monospace' }}>{error}</span>
    </div>
  )
  if (!file) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--red)', fontSize: 13 }}>
      File not found
    </div>
  )

  const totalEvents = counts.reduce((s, c) => s + c.count, 0)

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
        <Link to="/files" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 14 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Log Files
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <StatusBadge status={file.status} />
              <span className="badge badge-gray">{file.source}</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text)', fontFamily: 'Geist Mono,monospace', letterSpacing: '-0.01em' }}>
              {file.fileName}
            </h1>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--red)', fontFamily: 'Geist Mono,monospace', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {totalEvents}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>events found</div>
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <MetaField label="SESSION DATE" value={file.sessionDate ?? '—'} mono />
        <MetaField label="UPLOADED"     value={fmtDate(file.uploadedAt)} />
        <MetaField label="SOURCE"       value={file.source} />
        {file.errorMessage && <MetaField label="ERROR" value={file.errorMessage} />}
      </div>

      <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        {/* Left: event breakdown */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Event Breakdown
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {counts.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No events found</div>
            ) : counts.map(c => (
              <div key={c.eventType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Geist Mono,monospace' }}>{c.eventType}</span>
                <span className="badge badge-red">{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: top signatures */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            R5Check Signatures in this File
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead><tr>
                <th>Condition</th>
                <th>Source File</th>
                <th style={{ textAlign: 'right' }}>In this file</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr></thead>
              <tbody>
                {sigs.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-3)' }}>No R5Check events</td></tr>
                )}
                {sigs.map((s, i) => (
                  <tr key={s.id} className="animate-fade-in" style={{ animationDelay: `${i * 15}ms` }}
                    onClick={() => (window.location.href = `/r5checks/${s.id}?fileId=${id}`)}>
                    <td>
                      <Link to={`/r5checks/${s.id}`} style={{ color: 'var(--amber)', textDecoration: 'none', fontFamily: 'Geist Mono,monospace', fontSize: 12, fontWeight: 500 }}>
                        {s.conditionText}
                      </Link>
                    </td>
                    <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)' }}>{s.sourceFile ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}><span className="badge badge-amber">{s.fileCount}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="badge badge-gray">{s.totalCount}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
