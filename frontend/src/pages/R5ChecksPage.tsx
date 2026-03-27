import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, SignatureSummary, LogFileDto } from '../lib/api'

type Tab = 'all' | 'popular' | 'unique'

export function R5ChecksPage() {
  const [tab, setTab]     = useState<Tab>('all')
  const [data, setData]   = useState<SignatureSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [fileId,   setFileId]   = useState('')
  const [files,    setFiles]    = useState<LogFileDto[]>([])

  useEffect(() => {
    api.files.list({ pageSize: 200 } as never).then(r => setFiles(r.items)).catch(console.error)
  }, [])

  function load(t = tab, df = dateFrom, dt = dateTo, fi = fileId) {
    if (query.trim().length > 1) return
    setLoading(true)
    const params = { dateFrom: df || undefined, dateTo: dt || undefined, fileId: fi || undefined }
    const req = t === 'all' ? api.r5checks.summary(params)
      : t === 'popular'    ? api.r5checks.popular(20)
      : api.r5checks.unique()
    req.then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tab])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault(); if (!query.trim()) return
    setLoading(true)
    api.r5checks.search(query).then(setData).finally(() => setLoading(false))
  }

  function applyFilters() { load(tab, dateFrom, dateTo, fileId) }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setFileId('')
    load(tab, '', '', '')
  }

  const hasFilters = dateFrom || dateTo || fileId

  return (
    <div>
      <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text)' }}>R5 Checks</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Assertion failures grouped by unique signature</p>
          </div>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="input" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search condition, file…" style={{ paddingLeft: 28, width: 230, fontSize: 12 }} />
            </div>
            <button type="submit" className="btn btn-ghost" style={{ fontSize: 12 }}>Search</button>
            {query && <button type="button" className="btn btn-ghost" onClick={() => { setQuery(''); load() }}
              style={{ fontSize: 12, padding: '6px 10px' }}>✕</button>}
          </form>
        </div>
        <div className="tabs" style={{ width: 'fit-content' }}>
          {(['all', 'popular', 'unique'] as Tab[]).map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); setQuery('') }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar — only show for "all" tab */}
      {tab === 'all' && (
        <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filters
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px', colorScheme: 'light' }} />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
            <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px', colorScheme: 'light' }} />
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <select className="input" value={fileId} onChange={e => setFileId(e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer', maxWidth: 240 }}>
            <option value="">All files</option>
            {files.filter(f => f.status === 'done').map(f => (
              <option key={f.id} value={f.id}>{f.fileName}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={applyFilters} style={{ fontSize: 11, padding: '4px 10px' }}>Apply</button>
          {hasFilters && <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 11, padding: '4px 9px' }}>Clear</button>}
          {hasFilters && <span className="badge badge-amber">Filtered</span>}
        </div>
      )}

      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>Condition</th>
              <th>Where</th>
              <th>Source File</th>
              <th style={{ textAlign: 'center' }}>Files</th>
              <th style={{ textAlign: 'right' }}>Count</th>
              <th style={{ textAlign: 'right' }}>Last Seen</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                <span className="animate-pulse">Loading…</span>
              </td></tr>}
              {!loading && data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                {hasFilters ? 'No results for current filters' : 'No events found'}
              </td></tr>}
              {!loading && data.map((s, i) => (
                <tr key={s.id} className="animate-fade-in" style={{ animationDelay: `${i * 15}ms` }}
                  onClick={() => (window.location.href = `/r5checks/${s.id}`)}>
                  <td><Link to={`/r5checks/${s.id}`} style={{ color: 'var(--amber)', textDecoration: 'none', fontFamily: 'Geist Mono,monospace', fontSize: 12, fontWeight: 500 }}>{s.conditionText}</Link></td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.whereText}>{s.whereText}</td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)' }}>{s.sourceFile ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}><span className="badge badge-gray">{s.fileCount}</span></td>
                  <td style={{ textAlign: 'right' }}><span className="badge badge-red">{s.totalCount}</span></td>
                  <td style={{ textAlign: 'right', fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>{new Date(s.lastSeen).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
