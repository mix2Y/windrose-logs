import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, EventDetail, SignatureSummary } from '../lib/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

// Strip the log prefix: [2026.03.17-10.54.50:665][880]LogOutputDevice: Error: [Callstack] 0x...
function cleanCallstackLine(line: string): string {
  // Remove [Callstack] prefix
  let s = line.replace(/^\[Callstack\]\s*/, '')
  // Remove log line prefix [timestamp][frame]Category: Level:
  s = s.replace(/^\[\d{4}\.\d{2}\.\d{2}[^\]]*\]\[\s*\d+\][^\:]+:\s*(Error|Warning|Display|Verbose):\s*/i, '')
  s = s.replace(/^\[\d{4}\.\d{2}\.\d{2}[^\]]*\]\[\s*\d+\][^\:]+:\s*/i, '')
  return s.trim()
}

// Extract just the function name from a callstack line like:
// 0x00007ff62cde126 Windrose-Win64-Shipping.exe!URSGrassSubsystem::ApplyExclusionBoxMask() [D:\Source\...\file.cpp:39]
function parseCallstackLine(raw: string) {
  const cleaned = cleanCallstackLine(raw)
  // Match: addr Module!Function [file:line]
  const m = cleaned.match(/^(0x[0-9a-fA-F]+)\s+(.+?)(!.+?)?\s+\[([^\]]+)\]$/)
  if (m) return { addr: m[1], module: m[2], func: m[3]?.slice(1) ?? '', location: m[4], full: cleaned }
  // Match: addr Module!Function (no location)
  const m2 = cleaned.match(/^(0x[0-9a-fA-F]+)\s+(.+?)(!.+)?$/)
  if (m2) return { addr: m2[1], module: m2[2], func: m2[3]?.slice(1) ?? '', location: '', full: cleaned }
  return { addr: '', module: '', func: '', location: '', full: cleaned }
}

const PAGE_SIZE = 20

export function R5CheckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [signature, setSignature] = useState<SignatureSummary | null>(null)
  const [events, setEvents]       = useState<EventDetail[]>([])
  const [page,    setPage]        = useState(1)
  const [hasMore, setHasMore]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedId, setExpandedId]  = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.r5checks.details(id, 1)
      .then(r => {
        setSignature(r.signature)
        setEvents(r.events)
        setHasMore(r.events.length === PAGE_SIZE)
        setPage(1)
      })
      .finally(() => setLoading(false))
  }, [id])

  const loadMore = useCallback(async () => {
    if (!id || loadingMore) return
    setLoadingMore(true)
    const next = page + 1
    try {
      const r = await api.r5checks.details(id, next)
      setEvents(prev => [...prev, ...r.events])
      setHasMore(r.events.length === PAGE_SIZE)
      setPage(next)
    } finally { setLoadingMore(false) }
  }, [id, page, loadingMore])

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loadingMore)

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--text-3)', fontSize:13 }}><span className="animate-pulse">Loading…</span></div>
  if (!signature) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--red)', fontSize:13 }}>Signature not found</div>

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
        <Link to="/r5checks" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'var(--text-3)', textDecoration:'none', marginBottom:14 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to R5 Checks
        </Link>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
              <span className="badge badge-red">R5Check</span>
              {signature.sourceFile && <span style={{ fontFamily:'Geist Mono,monospace', fontSize:11, color:'var(--text-3)' }}>{signature.sourceFile}</span>}
            </div>
            <h1 style={{ margin:0, fontSize:17, fontWeight:600, color:'var(--amber)', fontFamily:'Geist Mono,monospace', letterSpacing:'-0.01em', wordBreak:'break-all' }}>
              '{signature.conditionText}'
            </h1>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:36, fontWeight:700, color:'var(--red)', fontFamily:'Geist Mono,monospace', lineHeight:1, letterSpacing:'-0.03em' }}>{signature.totalCount}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>occurrences</div>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ padding:'12px 28px', borderBottom:'1px solid var(--border)', background:'var(--bg)', display:'flex', gap:28, flexWrap:'wrap' }}>
        {[
          { label:'WHERE',      value: signature.whereText, mono: true },
          { label:'FIRST SEEN', value: new Date(signature.firstSeen).toLocaleString() },
          { label:'LAST SEEN',  value: new Date(signature.lastSeen).toLocaleString() },
          { label:'FILES',      value: `${signature.fileCount} file${signature.fileCount !== 1 ? 's' : ''}` },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.07em', marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:12, color:'var(--text-2)', fontFamily: mono ? 'Geist Mono,monospace' : undefined, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'20px 28px' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
          All Occurrences ({events.length}{hasMore ? '+' : ''})
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {events.map((ev, i) => (
            <div key={ev.id} className="card animate-fade-in" style={{ overflow:'hidden', animationDelay:`${Math.min(i,20)*18}ms` }}>
              <button onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                style={{ width:'100%', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', fontFamily:'inherit' }}>
                <span style={{ fontFamily:'Geist Mono,monospace', fontSize:11, color:'var(--text-3)', flexShrink:0 }}>
                  {new Date(ev.timestamp).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                </span>
                <span className="badge badge-gray">f{ev.frameNumber}</span>
                {ev.checkMessage && <span style={{ fontSize:11, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, textAlign:'left' }}>{ev.checkMessage}</span>}
                <Link to={`/files/${ev.file.id}`} onClick={e => e.stopPropagation()} style={{ fontSize:11, color:'var(--blue)', fontFamily:'Geist Mono,monospace', flexShrink:0, marginLeft:'auto', textDecoration:'none' }}>{ev.file.fileName}</Link>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"
                  style={{ flexShrink:0, transform: expandedId===ev.id ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {expandedId === ev.id && (
                <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg)', padding:14 }}>
                  {ev.checkMessage && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.07em', marginBottom:5 }}>MESSAGE</div>
                      <div style={{ fontFamily:'Geist Mono,monospace', fontSize:11, color:'var(--amber)', background:'var(--amber-bg)', border:'1px solid var(--amber-bdr)', borderRadius:5, padding:'8px 10px', wordBreak:'break-all', lineHeight:1.6 }}>{ev.checkMessage}</div>
                    </div>
                  )}
                  {ev.callstack.length > 0 && (
                    <>
                      <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', letterSpacing:'0.07em', marginBottom:5 }}>CALLSTACK</div>
                      <div style={{ fontFamily:'Geist Mono,monospace', fontSize:11, background:'var(--bg-2,#0d0d0d)', border:'1px solid var(--border)', borderRadius:5, overflow:'auto', maxHeight:260, lineHeight:1.8 }}>
                        {ev.callstack.map((raw, j) => {
                          const { addr, func, location, full } = parseCallstackLine(raw)
                          const hasStructure = addr || func
                          return (
                            <div key={j} title={full}
                              style={{ display:'flex', gap:8, padding:'2px 12px', borderBottom: j < ev.callstack.length-1 ? '1px solid var(--border)' : undefined, opacity: j === 0 ? 1 : 0.65, transition:'opacity 0.1s' }}
                              onMouseEnter={e => (e.currentTarget.style.opacity='1')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = j===0 ? '1' : '0.65')}>
                              {hasStructure ? (
                                <>
                                  <span style={{ color:'var(--text-3)', fontSize:10, flexShrink:0, minWidth:16, paddingTop:1 }}>{j+1}</span>
                                  <span style={{ color: j===0 ? 'var(--text)' : 'var(--text-2)', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{func || full}</span>
                                  {location && <span style={{ color:'var(--text-3)', fontSize:10, flexShrink:0, whiteSpace:'nowrap' }}>{location.split('\\').pop()}</span>}
                                </>
                              ) : (
                                <span style={{ color:'var(--text-3)', whiteSpace:'nowrap' }}>{full}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                  {ev.callstack.length === 0 && <div style={{ fontSize:11, color:'var(--text-3)' }}>No callstack recorded</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height:20, marginTop:8 }} />
        {loadingMore && <div style={{ textAlign:'center', padding:12, color:'var(--text-3)', fontSize:12 }}><span className="animate-pulse">Loading more…</span></div>}
      </div>
    </div>
  )
}
