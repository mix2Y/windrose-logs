import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, LogFileDto } from '../lib/api'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string>    = { done: 'badge-green', error: 'badge-red', processing: 'badge-blue', pending: 'badge-gray' }
  const labels: Record<string, string> = { done: '✓ done', error: '✗ error', processing: '⟳ processing', pending: '· pending' }
  return <span className={`badge ${map[status] ?? 'badge-gray'}`}>{labels[status] ?? status}</span>
}

// Format: "17 Mar 2026, 11:14" — compact and readable
function fmtUpload(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Session date comes as "2026-03-17" — show nicely
function fmtSession(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// How long ago
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

const STATUS_OPTIONS = ['', 'done', 'error', 'processing', 'pending']

export function FilesPage() {
  const [files, setFiles]       = useState<LogFileDto[]>([])
  const [total, setTotal]       = useState(0)
  const [page,  setPage]        = useState(1)
  const PAGE_SIZE = 100
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg]           = useState<{ text: string; ok: boolean } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [status,   setStatus]   = useState('')
  const fileRef  = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function loadFiles(p = page, df = dateFrom, dt = dateTo, st = status) {
    api.files.list({
      page:     p,
      pageSize: PAGE_SIZE,
      dateFrom: df || undefined,
      dateTo:   dt || undefined,
      status:   st || undefined,
    }).then(r => { setFiles(r.items); setTotal(r.total) }).catch(console.error)
  }

  useEffect(() => { loadFiles(page) }, [page])

  // Auto-refresh while pending/processing
  useEffect(() => {
    const pending = files.some(f => f.status === 'pending' || f.status === 'processing')
    if (!pending) return
    const t = setTimeout(() => loadFiles(page), 3000)
    return () => clearTimeout(t)
  }, [files])

  function applyFilters() { setPage(1); loadFiles(1, dateFrom, dateTo, status) }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setStatus(''); setPage(1)
    loadFiles(1, '', '', '')
  }

  const hasFilters = dateFrom || dateTo || status
  const totalPages = Math.ceil(total / PAGE_SIZE)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setMsg(null)
    try {
      await api.ingest.upload(file)
      setMsg({ text: `${file.name} uploaded`, ok: true })
      loadFiles()
    } catch { setMsg({ text: 'Upload failed', ok: false }) }
    finally { setUploading(false); e.target.value = '' }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text)' }}>Log Files</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            {total > 0 ? `${total} file${total !== 1 ? 's' : ''} total` : 'All uploaded sessions and processing status'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <input ref={fileRef} type="file" accept=".log" style={{ display: 'none' }} onChange={handleUpload} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <>
              <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'currentColor', display: 'inline-block' }} className="animate-spin"/>
              Processing…
            </> : <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload .log
            </>}
          </button>
          {msg && <span style={{ fontSize: 11, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.ok ? '✓' : '✗'} {msg.text}</span>}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Calendar icon label */}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Session date
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date" className="input" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ fontSize: 12, padding: '5px 9px', colorScheme: 'light' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
          <input
            type="date" className="input" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ fontSize: 12, padding: '5px 9px', colorScheme: 'light' }}
          />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Status filter */}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
        <select
          className="input"
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ fontSize: 12, padding: '5px 9px', cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === '' ? 'All' : s}</option>
          ))}
        </select>

        <button className="btn btn-primary" onClick={applyFilters} style={{ fontSize: 12, padding: '5px 12px' }}>
          Apply
        </button>

        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 12, padding: '5px 10px' }}>
            Clear
          </button>
        )}

        {hasFilters && (
          <span className="badge badge-amber" style={{ marginLeft: 2 }}>Filtered</span>
        )}
      </div>

      {/* Table */}
      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>File Name</th>
              <th>Source</th>
              <th>Session Date</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Events</th>
              <th style={{ textAlign: 'right' }}>Uploaded</th>
            </tr></thead>
            <tbody>
              {files.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 16px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
                    {hasFilters ? 'No files match the current filters' : 'No files yet'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {hasFilters ? 'Try adjusting the date range or status filter' : 'Upload a .log file to get started'}
                  </div>
                </td></tr>
              )}
              {files.map((f, i) => (
                <tr key={f.id} className="animate-fade-in"
                  style={{ animationDelay: `${i * 15}ms`, cursor: f.status === 'done' ? 'pointer' : 'default' }}
                  onClick={() => f.status === 'done' && navigate(`/files/${f.id}`)}>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 12, color: f.status === 'done' ? 'var(--blue)' : 'var(--text)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.fileName}
                  </td>
                  <td><span className="badge badge-gray">{f.source}</span></td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>
                    {fmtSession(f.sessionDate)}
                  </td>
                  <td><StatusBadge status={f.status} /></td>
                  <td style={{ textAlign: 'right' }}>
                    {f.status === 'done'
                      ? <span className="badge badge-red">{f.eventsFound}</span>
                      : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-2)' }}>
                      {fmtUpload(f.uploadedAt)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                      {timeAgo(f.uploadedAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" disabled={page === 1}
                onClick={() => setPage(p => p - 1)} style={{ fontSize: 12 }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1
                  : page <= 4 ? i + 1
                  : page >= totalPages - 3 ? totalPages - 6 + i
                  : page - 3 + i
                return (
                  <button key={p} className={`btn ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPage(p)} style={{ fontSize: 12, minWidth: 32, padding: '5px 8px' }}>
                    {p}
                  </button>
                )
              })}
              <button className="btn btn-ghost" disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)} style={{ fontSize: 12 }}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
