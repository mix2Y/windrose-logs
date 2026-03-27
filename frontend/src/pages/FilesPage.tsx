import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, LogFileDto } from '../lib/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { pushToast } from '../hooks/useToasts'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { done:'badge-green', error:'badge-red', processing:'badge-blue', pending:'badge-gray' }
  const labels: Record<string, string> = { done:'✓ done', error:'✗ error', processing:'⟳ processing', pending:'· pending' }
  return <span className={`badge ${map[status] ?? 'badge-gray'}`}>{labels[status] ?? status}</span>
}

function fmtUpload(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}
function fmtSession(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

const STATUS_OPTIONS = ['', 'done', 'error', 'processing', 'pending']
const PAGE_SIZE = 50

export function FilesPage() {
  const [files, setFiles]     = useState<LogFileDto[]>([])
  const [total, setTotal]     = useState(0)
  const [page,  setPage]      = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [status,   setStatus]   = useState('')
  const fileRef  = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const fetchPage = useCallback(async (p: number, df: string, dt: string, st: string, reset: boolean) => {
    setLoading(true)
    try {
      const r = await api.files.list({
        page: p, pageSize: PAGE_SIZE,
        dateFrom: df || undefined, dateTo: dt || undefined, status: st || undefined,
      })
      setTotal(r.total)
      setFiles(prev => reset ? r.items : [...prev, ...r.items])
      setHasMore(p * PAGE_SIZE < r.total)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  // Initial load
  useEffect(() => { fetchPage(1, '', '', '', true) }, [])

  // Auto-refresh while pending/processing
  useEffect(() => {
    const hasPending = files.some(f => f.status === 'pending' || f.status === 'processing')
    if (!hasPending) return
    const t = setTimeout(() => fetchPage(1, dateFrom, dateTo, status, true), 3000)
    return () => clearTimeout(t)
  }, [files])

  function applyFilters() {
    setPage(1)
    fetchPage(1, dateFrom, dateTo, status, true)
  }
  function clearFilters() {
    setDateFrom(''); setDateTo(''); setStatus(''); setPage(1)
    fetchPage(1, '', '', '', true)
  }

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    const next = page + 1
    setPage(next)
    fetchPage(next, dateFrom, dateTo, status, false)
  }, [loading, hasMore, page, dateFrom, dateTo, status])

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loading)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return
    setUploading(true); setMsg(null)
    const uploadedAt = new Date()
    try {
      const results = await api.ingest.upload(selected)
      const count = results.filter((r: any) => !(r as any).skipped).length
      const skipped = results.length - count
      setMsg({
        text: `${count} file${count !== 1 ? 's' : ''} uploaded${skipped ? `, ${skipped} skipped (duplicate)` : ''}`,
        ok: true,
      })
      fetchPage(1, dateFrom, dateTo, status, true)
      // Poll for completion then check for new signatures
      pollForAlerts(results.map((r: any) => r.fileId).filter(Boolean), uploadedAt)
    } catch { setMsg({ text: 'Upload failed', ok: false }) }
    finally { setUploading(false); e.target.value = '' }
  }

  function pollForAlerts(fileIds: string[], since: Date) {
    if (!fileIds.length) return
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      if (attempts > 40) { clearInterval(interval); return } // stop after ~2 min
      try {
        // Check if any of the uploaded files are done
        const r = await api.files.list({ pageSize: fileIds.length + 10 })
        const uploaded = r.items.filter(f => fileIds.includes(f.id))
        const allDone  = uploaded.length > 0 && uploaded.every(f => f.status === 'done' || f.status === 'error')
        if (!allDone) return
        clearInterval(interval)
        // Check for new R5Check signatures
        const newSigs = await api.r5checks.newSince(since)
        if (newSigs.length > 0) {
          pushToast({
            type: 'alert',
            title: `${newSigs.length} new R5Check signature${newSigs.length > 1 ? 's' : ''} detected`,
            body: newSigs.slice(0, 2).map(s => s.conditionText).join('\n')
              + (newSigs.length > 2 ? `\n+${newSigs.length - 2} more` : ''),
            duration: 10000,
          })
        } else {
          pushToast({ type: 'success', title: `Parsing complete`, body: `${uploaded.length} file${uploaded.length !== 1 ? 's' : ''} processed, no new signatures` })
        }
        fetchPage(1, dateFrom, dateTo, status, true)
      } catch { /* ignore */ }
    }, 3000)
  }

  const hasFilters = dateFrom || dateTo || status

  return (
    <div>
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em' }}>Log Files</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            {total > 0 ? `${files.length} / ${total} files` : 'All uploaded sessions'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <input ref={fileRef} type="file" accept=".log,.zip" multiple style={{ display: 'none' }} onChange={handleUpload} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading
              ? <><span style={{ width:11,height:11,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'currentColor',display:'inline-block' }} className="animate-spin"/>Uploading…</>
              : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload .log / .zip</>}
          </button>
          {msg && <span style={{ fontSize: 11, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.ok ? '✓' : '✗'} {msg.text}</span>}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
        {STATUS_OPTIONS.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); fetchPage(1, dateFrom, dateTo, s, true) }}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: 500, border: status === s ? '1.5px solid var(--amber)' : '1.5px solid var(--border)', background: status === s ? 'var(--amber-bg)' : 'transparent', color: status === s ? 'var(--amber)' : 'var(--text-3)' }}>
            {s === '' ? 'All' : s}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', colorScheme: 'light' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
          <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', colorScheme: 'light' }} />
        </div>
        <button className="btn btn-primary" onClick={applyFilters} style={{ fontSize: 11, padding: '4px 10px' }}>Apply</button>
        {hasFilters && <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 11, padding: '4px 9px' }}>Clear</button>}
      </div>

      {/* Table */}
      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>File Name</th><th>Source</th><th>Session Date</th><th>Status</th>
              <th style={{ textAlign: 'right' }}>Events</th><th style={{ textAlign: 'right' }}>Uploaded</th>
            </tr></thead>
            <tbody>
              {files.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-3)' }}>
                  {hasFilters ? 'No files match filters' : 'No files yet'}
                </td></tr>
              )}
              {files.map((f, i) => (
                <tr key={f.id} className="animate-fade-in"
                  style={{ animationDelay: `${Math.min(i,20) * 15}ms`, cursor: 'pointer' }}
                  onClick={() => navigate(`/files/${f.id}`)}>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 12, color: 'var(--blue)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                      <Link to={`/files/${f.id}/log`} onClick={e => e.stopPropagation()}
                        title="View raw log"
                        style={{ flexShrink: 0, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/></svg>
                      </Link>
                    </span>
                  </td>
                  <td><span className="badge badge-gray">{f.source}</span></td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>{fmtSession(f.sessionDate)}</td>
                  <td><StatusBadge status={f.status} /></td>
                  <td style={{ textAlign: 'right' }}>{f.status === 'done' ? <span className="badge badge-red">{f.eventsFound}</span> : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>{fmtUpload(f.uploadedAt)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{timeAgo(f.uploadedAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 20, marginTop: 8 }} />
        {loading && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-3)', fontSize: 12 }}><span className="animate-pulse">Loading…</span></div>}
        {!hasMore && files.length > 0 && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-3)', fontSize: 11 }}>All {total} files loaded</div>}
      </div>
    </div>
  )
}
