import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

function colorLine(text: string): string {
  if (/R5Check happens|!!! R5Check/.test(text)) return '#ff6b6b'
  if (/Memory leak suspected/.test(text)) return '#fbbf24'
  if (/Error:/.test(text)) return '#fc8181'
  if (/Warning:/.test(text)) return '#fcd34d'
  if (/\[Callstack\]/.test(text)) return 'rgba(255,255,255,0.32)'
  if (/Display:/.test(text)) return 'rgba(255,255,255,0.58)'
  return 'rgba(255,255,255,0.78)'
}

function bgLine(text: string): string {
  if (/R5Check happens|!!! R5Check/.test(text)) return 'rgba(255,80,80,0.08)'
  if (/Memory leak suspected/.test(text)) return 'rgba(255,180,0,0.07)'
  return 'transparent'
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text
  return <>
    {text.slice(0, idx)}
    <mark style={{ background: '#fbbf24', color: '#000', borderRadius: 2, padding: '0 1px' }}>
      {text.slice(idx, idx + term.length)}
    </mark>
    {text.slice(idx + term.length)}
  </>
}

export function LogViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [fileName, setFileName]   = useState('')
  const [lines, setLines]         = useState<{ lineNumber: number; text: string }[]>([])
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLines, setTotalLines] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState('')
  const [inputVal, setInputVal]   = useState('')
  const [filtered, setFiltered]   = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initial load
  const load = useCallback((f: string) => {
    if (!id) return
    setLoading(true); setError(null)
    setLines([]); setPage(1)
    api.files.raw(id, 1, f || undefined)
      .then(r => {
        setFileName(r.fileName)
        setLines(r.lines)
        setPage(1)
        setTotalPages(r.totalPages)
        setTotalLines(r.totalLines)
        setFiltered(r.filtered)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load('') }, [load])

  // Load next page (infinite scroll)
  const loadMore = useCallback(async () => {
    if (!id || loadingMore || page >= totalPages) return
    setLoadingMore(true)
    const next = page + 1
    try {
      const r = await api.files.raw(id, next, filter || undefined)
      setLines(prev => [...prev, ...r.lines])
      setPage(next)
    } catch { /**/ }
    finally { setLoadingMore(false) }
  }, [id, page, totalPages, filter, loadingMore])

  const sentinelRef = useInfiniteScroll(loadMore, page < totalPages && !loadingMore && !loading)

  function handleFilterInput(v: string) {
    setInputVal(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setFilter(v)
      load(v)
    }, 400)
  }

  function clearFilter() { setInputVal(''); setFilter(''); load('') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#111', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link to={`/files/${id}`} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'rgba(255,255,255,0.4)', textDecoration:'none', flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>
        <div style={{ fontFamily:'Geist Mono,monospace', fontSize:12, color:'rgba(255,255,255,0.7)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {fileName}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', flexShrink:0, whiteSpace:'nowrap' }}>
          {filtered ? `${totalLines} matches` : `${totalLines.toLocaleString()} lines`}
          {page < totalPages && ` · ${lines.length.toLocaleString()} loaded`}
        </div>
        {/* Search */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <svg style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.3)', pointerEvents:'none' }}
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={inputVal} onChange={e => handleFilterInput(e.target.value)}
            placeholder="Filter lines…"
            style={{ paddingLeft:26, width:200, fontSize:12, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:5, color:'rgba(255,255,255,0.8)', outline:'none', padding:'5px 8px 5px 26px', fontFamily:'Geist Mono,monospace' }} />
          {inputVal && <button onClick={clearFilter} style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.35)', fontSize:14, padding:0 }}>✕</button>}
        </div>
      </div>

      {/* Log content — scrollable */}
      <div style={{ flex:1, overflowY:'auto', background:'#0a0a0a' }}>
        {loading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'rgba(255,255,255,0.3)', fontSize:12 }}><span>Loading…</span></div>}
        {error   && <div style={{ padding:'20px', color:'#fc8181', fontSize:12, fontFamily:'Geist Mono,monospace' }}>{error}</div>}
        {!loading && !error && lines.length === 0 && (
          <div style={{ padding:'40px', color:'rgba(255,255,255,0.3)', fontSize:12, textAlign:'center' }}>
            {filtered ? 'No lines match the filter' : 'Empty file'}
          </div>
        )}
        {!loading && lines.map((line, i) => (
          <div key={line.lineNumber}
            style={{ display:'flex', alignItems:'flex-start', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)', borderLeft: bgLine(line.text) !== 'transparent' ? `2px solid ${colorLine(line.text)}` : '2px solid transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)')}>
            <span style={{ fontFamily:'Geist Mono,monospace', fontSize:11, color:'rgba(255,255,255,0.2)', minWidth:56, padding:'2px 8px 2px 6px', textAlign:'right', flexShrink:0, userSelect:'none', lineHeight:'1.8', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
              {line.lineNumber}
            </span>
            <span style={{ fontFamily:'Geist Mono,monospace', fontSize:12, color: colorLine(line.text), padding:'2px 14px 2px 10px', lineHeight:'1.8', wordBreak:'break-all', whiteSpace:'pre-wrap', flex:1 }}>
              {highlight(line.text, filter)}
            </span>
          </div>
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 20 }} />
        {loadingMore && <div style={{ textAlign:'center', padding:'12px', color:'rgba(255,255,255,0.3)', fontSize:11, fontFamily:'Geist Mono,monospace' }}>Loading more…</div>}
        {!loading && !loadingMore && page >= totalPages && lines.length > 0 && (
          <div style={{ textAlign:'center', padding:'16px', color:'rgba(255,255,255,0.2)', fontSize:11, fontFamily:'Geist Mono,monospace' }}>
            ── end of file ──
          </div>
        )}
      </div>
    </div>
  )
}
