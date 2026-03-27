import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, SignatureSummary, LogFileDto } from '../lib/api'

type Tab    = 'all' | 'popular' | 'unique'
type SortBy = 'totalCount' | 'fileCount' | 'lastSeen' | 'firstSeen' | 'conditionText'
type SortDir = 'asc' | 'desc'

function SortHeader({ label, col, sortBy, sortDir, onSort, style }: {
  label: string; col: SortBy; sortBy: SortBy; sortDir: SortDir
  onSort: (c: SortBy) => void; style?: React.CSSProperties
}) {
  const active = sortBy === col
  return (
    <th style={{ cursor: 'pointer', userSelect: 'none', ...style }}
      onClick={() => onSort(col)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--amber)' : 'var(--text-3)'} strokeWidth="2.5">
          {active && sortDir === 'asc'
            ? <polyline points="18 15 12 9 6 15"/>
            : active && sortDir === 'desc'
              ? <polyline points="6 9 12 15 18 9"/>
              : <><polyline points="18 15 12 9 6 15" opacity="0.4"/><polyline points="6 15 12 21 18 15" opacity="0.4"/></>}
        </svg>
      </span>
    </th>
  )
}

export function R5ChecksPage() {
  const [tab,      setTab]      = useState<Tab>('all')
  const [raw,      setRaw]      = useState<SignatureSummary[]>([])   // unfiltered from API
  const [display,  setDisplay]  = useState<SignatureSummary[]>([])   // after sort+search
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [sortBy,   setSortBy]   = useState<SortBy>('totalCount')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [fileId,   setFileId]   = useState('')
  const [files,    setFiles]    = useState<LogFileDto[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    api.files.list({ pageSize: 200 } as never).then(r => setFiles(r.items)).catch(console.error)
  }, [])

  // Fetch from API
  const fetchData = useCallback(async (t: Tab, df: string, dt: string, fi: string) => {
    setLoading(true)
    try {
      const params = { dateFrom: df || undefined, dateTo: dt || undefined, fileId: fi || undefined }
      const items = t === 'all'     ? await api.r5checks.summary(params)
                  : t === 'popular' ? await api.r5checks.popular(50)
                  :                   await api.r5checks.unique()
      setRaw(items)
    } catch { /**/ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData(tab, dateFrom, dateTo, fileId) }, [tab])

  // Sort + client-side search
  useEffect(() => {
    let items = [...raw]
    const q = query.trim().toLowerCase()
    if (q) {
      items = items.filter(s =>
        s.conditionText?.toLowerCase().includes(q) ||
        s.whereText?.toLowerCase().includes(q) ||
        s.sourceFile?.toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0
      if (sortBy === 'totalCount')   { av = a.totalCount;  bv = b.totalCount }
      if (sortBy === 'fileCount')    { av = a.fileCount;   bv = b.fileCount }
      if (sortBy === 'lastSeen')     { av = a.lastSeen;    bv = b.lastSeen }
      if (sortBy === 'firstSeen')    { av = a.firstSeen;   bv = b.firstSeen }
      if (sortBy === 'conditionText'){ av = a.conditionText ?? ''; bv = b.conditionText ?? '' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    setDisplay(items)
  }, [raw, query, sortBy, sortDir])

  function handleSort(col: SortBy) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  // Debounced search input
  function handleSearchInput(v: string) {
    setQuery(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    // immediate client-side filter — no debounce needed since it's local
  }

  function applyFilters() { fetchData(tab, dateFrom, dateTo, fileId) }
  function clearFilters() { setDateFrom(''); setDateTo(''); setFileId(''); fetchData(tab, '', '', '') }

  const hasFilters = dateFrom || dateTo || fileId
  const uniqueCount = raw.filter(s => s.totalCount === 1).length


  return (
    <div>
      <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em' }}>R5 Checks</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {loading ? 'Loading…' : `${display.length}${display.length !== raw.length ? ` / ${raw.length}` : ''} signatures`}
            </p>
          </div>
          {/* Search — real-time client-side */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)', pointerEvents:'none' }}
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="input" value={query} onChange={e => handleSearchInput(e.target.value)}
              placeholder="Search condition, where, file…" style={{ paddingLeft: 28, width: 260, fontSize: 12 }} />
            {query && <button style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', fontSize:14, padding:0 }}
              onClick={() => setQuery('')}>✕</button>}
          </div>
        </div>
        <div className="tabs" style={{ width: 'fit-content' }}>
          {(['all', 'popular', 'unique'] as Tab[]).map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setQuery('') }}>
              {t === 'unique' ? `Unique (${uniqueCount})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters — only for "all" tab */}
      {tab === 'all' && (
        <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filters</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', colorScheme: 'light' }} />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
            <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', colorScheme: 'light' }} />
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <select className="input" value={fileId} onChange={e => setFileId(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer', maxWidth: 240 }}>
            <option value="">All files</option>
            {files.filter(f => f.status === 'done').map(f => <option key={f.id} value={f.id}>{f.fileName}</option>)}
          </select>
          <button className="btn btn-primary" onClick={applyFilters} style={{ fontSize: 11, padding: '4px 10px' }}>Apply</button>
          {hasFilters && <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 11, padding: '4px 9px' }}>Clear</button>}
        </div>
      )}

      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <SortHeader label="Condition"  col="conditionText" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th>Where</th>
              <th>Source File</th>
              <SortHeader label="Files"  col="fileCount"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'center' }} />
              <SortHeader label="Count"  col="totalCount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'right' }} />
              <SortHeader label="First"  col="firstSeen"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'right' }} />
              <SortHeader label="Last"   col="lastSeen"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'right' }} />
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}><span className="animate-pulse">Loading…</span></td></tr>}
              {!loading && display.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No results</td></tr>}
              {!loading && display.map((s, i) => (
                <tr key={s.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i,20)*15}ms` }}
                  onClick={() => (window.location.href = `/r5checks/${s.id}`)}>
                  <td><Link to={`/r5checks/${s.id}`} style={{ color:'var(--amber)', textDecoration:'none', fontFamily:'Geist Mono,monospace', fontSize:12, fontWeight:500 }} onClick={e => e.stopPropagation()}>{s.conditionText}</Link></td>
                  <td style={{ fontFamily:'Geist Mono,monospace', fontSize:11, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.whereText}>{s.whereText}</td>
                  <td style={{ fontFamily:'Geist Mono,monospace', fontSize:11, color:'var(--text-3)' }}>{s.sourceFile ?? '—'}</td>
                  <td style={{ textAlign:'center' }}><span className="badge badge-gray">{s.fileCount}</span></td>
                  <td style={{ textAlign:'right' }}><span className="badge badge-red">{s.totalCount}</span></td>
                  <td style={{ textAlign:'right', fontFamily:'Geist Mono,monospace', fontSize:11 }}>{new Date(s.firstSeen).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</td>
                  <td style={{ textAlign:'right', fontFamily:'Geist Mono,monospace', fontSize:11 }}>{new Date(s.lastSeen).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
