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

function bgLine(text: string) {
  if (/R5Check happens|!!! R5Check/.test(text)) return 'rgba(255,80,80,0.08)'
  if (/Memory leak suspected/.test(text)) return 'rgba(255,180,0,0.07)'
  return ''
}

function Highlight({ text, term, isCurrent }: { text: string; term: string; isCurrent: boolean }) {
  if (!term) return <>{text}</>
  const lower = text.toLowerCase(), tl = term.toLowerCase()
  const parts: React.ReactNode[] = []
  let last = 0, idx = 0
  while ((idx = lower.indexOf(tl, last)) !== -1) {
    if (idx > last) parts.push(text.slice(last, idx))
    parts.push(<mark key={idx} style={{ background: isCurrent ? '#ff9500' : '#fbbf24', color:'#000', borderRadius:2, padding:'0 1px' }}>{text.slice(idx, idx + term.length)}</mark>)
    last = idx + term.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function LogViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [fileName, setFileName] = useState('')
  const [lines, setLines]       = useState<{ lineNumber: number; text: string }[]>([])
  const [page, setPage]         = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLines, setTotalLines] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingAll, setLoadingAll]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Search
  const [showSearch, setShowSearch] = useState(false)
  const [inputVal, setInputVal]     = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [matchIndices, setMatchIndices] = useState<number[]>([])
  const [currentMatch, setCurrentMatch] = useState(0)

  const lineRefs    = useRef<Map<number, HTMLDivElement>>(new Map())
  const searchInput = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInput.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Load page
  const loadPage = useCallback(async (p: number, reset: boolean) => {
    if (!id) return
    if (reset) { setLoading(true); setError(null); setLines([]); lineRefs.current.clear() }
    else setLoadingMore(true)
    try {
      const r = await api.files.raw(id, p)
      setFileName(r.fileName)
      setLines(prev => reset ? r.lines : [...prev, ...r.lines])
      setPage(p); setTotalPages(r.totalPages); setTotalLines(r.totalLines)
    } catch (e) { setError(String(e)) }
    finally { reset ? setLoading(false) : setLoadingMore(false) }
  }, [id])

  useEffect(() => { loadPage(1, true) }, [loadPage])

  // Load all pages for search
  const loadAllPages = useCallback(async (currentPage: number, total: number) => {
    if (currentPage >= total || !id) return
    setLoadingAll(true)
    const allNew: { lineNumber: number; text: string }[] = []
    try {
      let p = currentPage + 1
      while (p <= total) {
        const r = await api.files.raw(id, p)
        allNew.push(...r.lines); p++
      }
      setLines(prev => [...prev, ...allNew]); setPage(total)
    } catch { /**/ }
    finally { setLoadingAll(false) }
  }, [id])

  const loadMore = useCallback(() => {
    if (!searchTerm && page < totalPages && !loadingMore && !loading) loadPage(page + 1, false)
  }, [page, totalPages, loadingMore, loading, loadPage, searchTerm])

  const sentinelRef = useInfiniteScroll(loadMore, !searchTerm && page < totalPages && !loadingMore && !loading)

  // When search term changes — load all pages then find
  useEffect(() => {
    if (!searchTerm) { setMatchIndices([]); setCurrentMatch(0); return }
    if (page < totalPages && !loadingAll) loadAllPages(page, totalPages)
  }, [searchTerm]) // eslint-disable-line

  // Recompute matches
  useEffect(() => {
    if (!searchTerm) return
    const term = searchTerm.toLowerCase()
    const indices = lines.reduce<number[]>((acc, line, i) => {
      if (line.text.toLowerCase().includes(term)) acc.push(i)
      return acc
    }, [])
    setMatchIndices(indices); setCurrentMatch(0)
  }, [searchTerm, lines])

  // Scroll to match
  useEffect(() => {
    if (!matchIndices.length) return
    const lineNum = lines[matchIndices[currentMatch]]?.lineNumber
    if (lineNum == null) return
    lineRefs.current.get(lineNum)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentMatch, matchIndices, lines])

  function handleInput(v: string) {
    setInputVal(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchTerm(v.trim()), 250)
  }
  function closeSearch() { setShowSearch(false); setInputVal(''); setSearchTerm('') }
  function goNext() { setCurrentMatch(c => matchIndices.length ? (c + 1) % matchIndices.length : 0) }
  function goPrev() { setCurrentMatch(c => matchIndices.length ? (c - 1 + matchIndices.length) % matchIndices.length : 0) }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() }
    if (e.key === 'Escape') closeSearch()
  }

  const matchCount = matchIndices.length
  const isSearching = loadingAll && !!searchTerm

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>
      {/* Top bar */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)', background:'#141414', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <Link to={`/files/${id}`} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'rgba(255,255,255,0.4)', textDecoration:'none', flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>
        <div style={{ fontFamily:'Geist Mono,monospace', fontSize:12, color:'rgba(255,255,255,0.65)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {fileName}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', flexShrink:0, whiteSpace:'nowrap' }}>
          {totalLines.toLocaleString()} lines{page < totalPages && !searchTerm ? ` · ${lines.length.toLocaleString()} loaded` : ''}
        </div>
        {/* Ctrl+F hint */}
        <button onClick={() => { setShowSearch(true); setTimeout(() => searchInput.current?.focus(), 50) }}
          style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:4, color:'rgba(255,255,255,0.4)', fontSize:11, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ fontFamily:'Geist Mono,monospace' }}>Ctrl+F</span>
        </button>
      </div>

      {/* Log content — position relative for search overlay */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

        {/* VS Code find panel — top right overlay */}
        {showSearch && (
          <div style={{
            position:'absolute', top:0, right:0, zIndex:100,
            background:'#252526', border:'1px solid #454545',
            borderTop:'none', borderRight:'none',
            borderRadius:'0 0 0 6px',
            boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
            display:'flex', alignItems:'center', gap:6,
            padding:'6px 8px', minWidth:380,
          }}>
            {/* Search icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" style={{ flexShrink:0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>

            {/* Input */}
            <input
              ref={searchInput}
              value={inputVal}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Find"
              style={{
                flex:1, minWidth:160, fontSize:13,
                background:'#3c3c3c', border:'1px solid #555',
                borderRadius:3, color:'#d4d4d4',
                padding:'3px 8px', outline:'none',
                fontFamily:'Geist Mono,monospace',
              }}
            />

            {/* Match count */}
            <span style={{ fontSize:12, color: isSearching ? '#888' : matchCount > 0 ? '#d4d4d4' : '#f48771', whiteSpace:'nowrap', minWidth:60, textAlign:'center', fontFamily:'Geist Mono,monospace' }}>
              {isSearching ? 'searching…' : searchTerm ? (matchCount > 0 ? `${currentMatch+1} of ${matchCount}` : 'No results') : ''}
            </span>

            {/* Divider */}
            <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)' }} />

            {/* Prev / Next */}
            <button onClick={goPrev} disabled={!matchCount} title="Previous Match (Shift+Enter)"
              style={{ background:'none', border:'none', cursor: matchCount ? 'pointer' : 'default', color: matchCount ? '#d4d4d4' : '#555', padding:'2px 4px', borderRadius:3, fontSize:14, lineHeight:1 }}
              onMouseEnter={e => matchCount && ((e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.1)')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background='none')}>
              ↑
            </button>
            <button onClick={goNext} disabled={!matchCount} title="Next Match (Enter)"
              style={{ background:'none', border:'none', cursor: matchCount ? 'pointer' : 'default', color: matchCount ? '#d4d4d4' : '#555', padding:'2px 4px', borderRadius:3, fontSize:14, lineHeight:1 }}
              onMouseEnter={e => matchCount && ((e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.1)')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background='none')}>
              ↓
            </button>

            {/* Close */}
            <button onClick={closeSearch} title="Close (Escape)"
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:'2px 4px', borderRadius:3, fontSize:16, lineHeight:1, marginLeft:2 }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.1)')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background='none')}>
              ✕
            </button>
          </div>
        )}

        {/* Scrollable log */}
        <div style={{ height:'100%', overflowY:'auto', background:'#0a0a0a', fontFamily:'Geist Mono,monospace' }}>
          {loading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'rgba(255,255,255,0.25)', fontSize:12 }}>Loading…</div>}
          {error   && <div style={{ padding:20, color:'#fc8181', fontSize:12 }}>{error}</div>}
          {!loading && lines.length === 0 && <div style={{ padding:40, color:'rgba(255,255,255,0.25)', fontSize:12, textAlign:'center' }}>Empty file</div>}

          {!loading && lines.map((line, i) => {
            const isMatch   = !!searchTerm && line.text.toLowerCase().includes(searchTerm.toLowerCase())
            const isCurrent = isMatch && matchIndices[currentMatch] === i
            const bg = isCurrent ? 'rgba(255,149,0,0.2)' : isMatch ? 'rgba(251,191,36,0.07)' : bgLine(line.text) || (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)')

            return (
              <div key={line.lineNumber}
                ref={el => { if (el) lineRefs.current.set(line.lineNumber, el); else lineRefs.current.delete(line.lineNumber) }}
                style={{ display:'flex', alignItems:'flex-start', background:bg, borderLeft: isCurrent ? '2px solid #ff9500' : bgLine(line.text) ? `2px solid ${colorLine(line.text)}` : '2px solid transparent' }}>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)', minWidth:58, padding:'2px 8px 2px 6px', textAlign:'right', flexShrink:0, userSelect:'none', lineHeight:'1.8', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
                  {line.lineNumber}
                </span>
                <span style={{ fontSize:12, color:colorLine(line.text), padding:'2px 14px 2px 10px', lineHeight:'1.8', wordBreak:'break-all', whiteSpace:'pre-wrap', flex:1 }}>
                  <Highlight text={line.text} term={searchTerm} isCurrent={isCurrent} />
                </span>
              </div>
            )
          })}

          {!searchTerm && <div ref={sentinelRef} style={{ height:20 }} />}
          {loadingMore && !searchTerm && <div style={{ textAlign:'center', padding:12, color:'rgba(255,255,255,0.25)', fontSize:11 }}>Loading…</div>}
          {!loading && !loadingMore && !loadingAll && page >= totalPages && lines.length > 0 && (
            <div style={{ textAlign:'center', padding:16, color:'rgba(255,255,255,0.15)', fontSize:11 }}>── end of file ──</div>
          )}
        </div>
      </div>
    </div>
  )
}
