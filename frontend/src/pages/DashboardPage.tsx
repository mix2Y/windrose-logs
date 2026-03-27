import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, SignatureSummary } from '../lib/api'

// Mini bar chart using SVG — no recharts needed for this simple case
function TimelineChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return (
    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>
      No data yet
    </div>
  )
  const max = Math.max(...data.map(d => d.count), 1)
  const w = 100 / data.length

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 100 40`} preserveAspectRatio="none" style={{ width: '100%', height: 80, display: 'block' }}>
        {data.map((d, i) => {
          const h = (d.count / max) * 36
          const x = i * w + w * 0.1
          const barW = w * 0.8
          return (
            <g key={d.date}>
              <rect x={x} y={40 - h} width={barW} height={h}
                fill="var(--red)" opacity="0.7" rx="0.5">
                <title>{new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: {d.count}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      {/* X-axis labels — show first, middle, last */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {[data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].filter(Boolean).map(d => (
          <span key={d.date} style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'Geist Mono,monospace' }}>
            {new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="card animate-fade-in" style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: 'Geist Mono,monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export function DashboardPage() {
  const [summary,  setSummary]  = useState<SignatureSummary[]>([])
  const [timeline, setTimeline] = useState<{ date: string; count: number }[]>([])
  const [days,     setDays]     = useState(30)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [sortBy,  setSortBy]  = useState<'totalCount' | 'lastSeen' | 'firstSeen' | 'fileCount'>('totalCount')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { api.r5checks.summary().then(setSummary).catch(console.error) }, [])
  useEffect(() => { api.r5checks.timeline(days).then(setTimeline).catch(console.error) }, [days])

  const sorted = [...summary].sort((a, b) => {
    const av = a[sortBy] as number | string
    const bv = b[sortBy] as number | string
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  function SortIcon({ col }: { col: typeof sortBy }) {
    const active = sortBy === col
    return (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--amber)' : 'var(--text-3)'} strokeWidth="2.5" style={{ marginLeft: 3 }}>
        {active && sortDir === 'asc'  ? <polyline points="18 15 12 9 6 15"/> :
         active && sortDir === 'desc' ? <polyline points="6 9 12 15 18 9"/> :
         <><polyline points="18 15 12 9 6 15" opacity="0.3"/><polyline points="6 15 12 21 18 15" opacity="0.3"/></>}
      </svg>
    )
  }

  const total = summary.reduce((s, x) => s + x.totalCount, 0)
  const lastSeen = summary.length
    ? new Date(Math.max(...summary.map(s => +new Date(s.lastSeen)))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setMsg(null)
    try {
      await api.ingest.upload(file)
      setMsg({ text: `${file.name} uploaded`, ok: true })
      setTimeout(() => api.r5checks.summary().then(setSummary), 2500)
    } catch { setMsg({ text: 'Upload failed', ok: false }) }
    finally { setUploading(false); e.target.value = '' }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text)' }}>Dashboard</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Overview of all processed log sessions</p>
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

      <div style={{ padding: '24px 28px' }}>
        {/* Stats */}
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Total R5Checks" value={total.toLocaleString()} color="var(--red)" />
          <StatCard label="Unique Signatures" value={summary.length} color="var(--amber)" />
          <StatCard label="Last Event" value={lastSeen} color="var(--text)" sub="most recent occurrence" />
        </div>

        {/* Timeline chart */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              R5Check Events / Day
            </div>
            <div className="tabs" style={{ padding: 2 }}>
              {[7, 14, 30].map(d => (
                <button key={d} className={`tab ${days === d ? 'active' : ''}`}
                  onClick={() => setDays(d)} style={{ padding: '3px 10px', fontSize: 11 }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <TimelineChart data={timeline} />
        </div>

        {/* Top signatures table */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Top Signatures</span>
          <Link to="/r5checks" style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>Condition</th>
              <th>Source File</th>
              <th style={{ textAlign: 'center', cursor:'pointer' }} onClick={() => handleSort('fileCount')}>Files <SortIcon col="fileCount"/></th>
              <th style={{ textAlign: 'right', cursor:'pointer' }} onClick={() => handleSort('totalCount')}>Count <SortIcon col="totalCount"/></th>
              <th style={{ textAlign: 'right', cursor:'pointer' }} onClick={() => handleSort('firstSeen')}>First <SortIcon col="firstSeen"/></th>
              <th style={{ textAlign: 'right', cursor:'pointer' }} onClick={() => handleSort('lastSeen')}>Last <SortIcon col="lastSeen"/></th>
            </tr></thead>
            <tbody>
              {summary.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-3)' }}>
                  No events yet — upload a .log file to get started
                </td></tr>
              )}
              {sorted.slice(0, 15).map(s => (
                <tr key={s.id} onClick={() => (window.location.href = `/r5checks/${s.id}`)}>
                  <td><Link to={`/r5checks/${s.id}`} style={{ color: 'var(--amber)', textDecoration: 'none', fontFamily: 'Geist Mono,monospace', fontSize: 12, fontWeight: 500 }} onClick={e => e.stopPropagation()}>{s.conditionText}</Link></td>
                  <td style={{ fontFamily: 'Geist Mono,monospace', fontSize: 11, color: 'var(--text-3)' }}>{s.sourceFile ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}><span className="badge badge-gray">{s.fileCount}</span></td>
                  <td style={{ textAlign: 'right' }}><span className="badge badge-red">{s.totalCount}</span></td>
                  <td style={{ textAlign: 'right', fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>{new Date(s.firstSeen).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>{new Date(s.lastSeen).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
