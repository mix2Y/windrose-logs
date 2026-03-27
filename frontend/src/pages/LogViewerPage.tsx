import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const CONTEXT = 3  // lines of context around each match

function colorLine(t: string) {
  if (/R5Check happens|!!! R5Check/.test(t)) return '#ff6b6b'
  if (/Memory leak suspected/.test(t)) return '#fbbf24'
  if (/Error:/.test(t)) return '#fc8181'
  if (/Warning:/.test(t)) return '#fcd34d'
  if (/\[Callstack\]/.test(t)) return 'rgba(255,255,255,0.32)'
  if (/Display:/.test(t)) return 'rgba(255,255,255,0.58)'
  return 'rgba(255,255,255,0.78)'
}
function bgLine(t: string) {
  if (/R5Check happens|!!! R5Check/.test(t)) return 'rgba(255,80,80,0.10)'
  if (/Memory leak suspected/.test(t)) return 'rgba(255,180,0,0.08)'
  return ''
}

function Highlight({ text, term, cur }: { text: string; term: string; cur: boolean }) {
  if (!term) return <>{text}</>
  const lo = text.toLowerCase(), tl = term.toLowerCase()
  const parts: React.ReactNode[] = []
  let last = 0, i = 0
  while ((i = lo.indexOf(tl, last)) !== -1) {
    if (i > last) parts.push(text.slice(last, i))
    parts.push(<mark key={i} style={{ background: cur ? '#ff9500' : '#fbbf24', color:'#000', borderRadius:2, padding:'0 2px' }}>{text.slice(i, i+term.length)}</mark>)
    last = i + term.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

type LineItem = { lineNumber: number; text: string }
type ViewItem =
  | { type: 'line'; line: LineItem; matchIdx: number | null }   // matchIdx = index in matchList
  | { type: 'collapsed'; count: number; after: number }          // collapsed N lines after lineNumber

/** Build collapsed view: show only match±CONTEXT lines, collapse the rest */
function buildView(lines: LineItem[], term: string, matchList: number[]): ViewItem[] {
  if (!term || !matchList.length) return lines.map(l => ({ type: 'line', line: l, matchIdx: null }))

  // Which line indices to show
  const visible = new Set<number>()
  matchList.forEach(mi => {
    for (let k = Math.max(0, mi - CONTEXT); k <= Math.min(lines.length - 1, mi + CONTEXT); k++)
      visible.add(k)
  })

  // matchIdx lookup
  const matchSet = new Map(matchList.map((mi, idx) => [mi, idx]))

  const items: ViewItem[] = []
  let collapsedStart = -1
  let collapsedCount = 0

  for (let i = 0; i < lines.length; i++) {
    if (visible.has(i)) {
      if (collapsedCount > 0) {
        items.push({ type: 'collapsed', count: collapsedCount, after: lines[collapsedStart - 1]?.lineNumber ?? 0 })
        collapsedCount = 0
      }
      items.push({ type: 'line', line: lines[i], matchIdx: matchSet.get(i) ?? null })
    } else {
      if (collapsedCount === 0) collapsedStart = i
      collapsedCount++
    }
  }
  if (collapsedCount > 0)
    items.push({ type: 'collapsed', count: collapsedCount, after: lines[collapsedStart - 1]?.lineNumber ?? 0 })

  return items
}

export function LogViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [fileName, setFileName] = useState('')
  const [lines, setLines]       = useState<LineItem[]>([])
  const [page, setPage]         = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLines, setTotalLines] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingAll, setLoadingAll]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [showSearch, setShowSearch] = useState(false)
  const [inputVal, setInputVal]     = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [matchList, setMatchList]   = useState<number[]>([])  // indices into lines[]
  const [currentMatch, setCurrentMatch] = useState(0)

  const matchRefs  = useRef<Map<number, HTMLDivElement>>(new Map())  // matchIdx → el
  const searchRef  = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ctrl+F
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); setShowSearch(true)
        setTimeout(() => searchRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const loadPage = useCallback(async (p: number, reset: boolean) => {
    if (!id) return
    if (reset) { setLoading(true); setError(null); setLines([]) }
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

  const loadAllPages = useCallback(async (cur: number, total: number) => {
    if (cur >= total || !id) return
    setLoadingAll(true)
    try {
      let p = cur + 1
      const acc: LineItem[] = []
      while (p <= total) { const r = await api.files.raw(id, p); acc.push(...r.lines); p++ }
      setLines(prev => [...prev, ...acc]); setPage(total)
    } catch { /**/ } finally { setLoadingAll(false) }
  }, [id])

  const loadMore = useCallback(() => {
    if (!searchTerm && page < totalPages && !loadingMore && !loading) loadPage(page + 1, false)
  }, [page, totalPages, loadingMore, loading, loadPage, searchTerm])

  const sentinelRef = useInfiniteScroll(loadMore, !searchTerm && page < totalPages && !loadingMore && !loading)

  // When search set — load all pages first
  useEffect(() => {
    if (!searchTerm) { setMatchList([]); setCurrentMatch(0); return }
    if (page < totalPages && !loadingAll) loadAllPages(page, totalPages)
  }, [searchTerm]) // eslint-disable-line

  // Recompute matches after lines or term change
  useEffect(() => {
    if (!searchTerm) return
    const tl = searchTerm.toLowerCase()
    setMatchList(lines.reduce<number[]>((a, l, i) => { if (l.text.toLowerCase().includes(tl)) a.push(i); return a }, []))
    setCurrentMatch(0)
  }, [searchTerm, lines])

  // Scroll to current match
  useEffect(() => {
    if (!matchList.length) return
    matchRefs.current.get(currentMatch)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentMatch, matchList])

  function handleInput(v: string) {
    setInputVal(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchTerm(v.trim()), 250)
  }
  function closeSearch() { setShowSearch(false); setInputVal(''); setSearchTerm('') }
  function goNext() { setCurrentMatch(c => matchList.length ? (c+1) % matchList.length : 0) }
  function goPrev() { setCurrentMatch(c => matchList.length ? (c-1+matchList.length) % matchList.length : 0) }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() }
    if (e.key === 'Escape') closeSearch()
  }

  const view = buildView(lines, searchTerm, matchList)
  const matchCount = matchList.length
  const isSearching = loadingAll && !!searchTerm

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>
      {/* Top bar */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)', background:'#141414', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <Link to={`/files/${id}`} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'rgba(255,255,255,0.4)', textDecoration:'none', flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>
        <span style={{ fontFamily:'Geist Mono,monospace', fontSize:12, color:'rgba(255,255,255,0.65)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{fileName}</span>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)', whiteSpace:'nowrap' }}>
          {totalLines.toLocaleString()} lines{page < totalPages && !searchTerm ? ` · ${lines.length.toLocaleString()} loaded` : ''}
        </span>
        <button onClick={() => { setShowSearch(s => !s); setTimeout(() => searchRef.current?.focus(), 50) }}
          style={{ background: showSearch ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:4, color:'rgba(255,255,255,0.5)', fontSize:11, padding:'3px 8px', cursor:'pointer', fontFamily:'Geist Mono,monospace' }}>
          🔍 Ctrl+F
        </button>
      </div>

      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        {/* VS Code Find panel — top right */}
        {showSearch && (
          <div style={{ position:'absolute', top:0, right:0, zIndex:100, background:'#252526', border:'1px solid #454545', borderTop:'none', borderRight:'none', borderRadius:'0 0 0 6px', boxShadow:'0 4px 24px rgba(0,0,0,0.5)', display:'flex', alignItems:'center', gap:6, padding:'6px 10px', minWidth:360 }}>
            <input ref={searchRef} value={inputVal} onChange={e => handleInput(e.target.value)} onKeyDown={onKey}
              placeholder="Find in file"
              style={{ flex:1, fontSize:13, background:'#3c3c3c', border:'1px solid rgba(255,255,255,0.15)', borderRadius:3, color:'#d4d4d4', padding:'4px 8px', outline:'none', fontFamily:'Geist Mono,monospace' }} />
            <span style={{ fontSize:12, color: isSearching ? '#888' : matchCount > 0 ? '#d4d4d4' : searchTerm ? '#f48771' : 'transparent', whiteSpace:'nowrap', minWidth:70, textAlign:'center', fontFamily:'Geist Mono,monospace' }}>
              {isSearching ? 'loading…' : searchTerm ? (matchCount > 0 ? `${currentMatch+1} of ${matchCount}` : 'No results') : ''}
            </span>
            <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)' }} />
            {(['↑','↓'] as const).map((arrow, ai) => (
              <button key={arrow} onClick={ai === 0 ? goPrev : goNext} disabled={!matchCount}
                title={ai===0 ? 'Previous (Shift+Enter)' : 'Next (Enter)'}
                style={{ background:'none', border:'none', cursor: matchCount ? 'pointer':'default', color: matchCount ? '#d4d4d4':'#555', padding:'2px 5px', borderRadius:3, fontSize:15, lineHeight:1 }}
                onMouseEnter={e => matchCount && ((e.currentTarget).style.background='rgba(255,255,255,0.1)')}
                onMouseLeave={e => ((e.currentTarget).style.background='none')}>{arrow}</button>
            ))}
            <button onClick={closeSearch} title="Close (Escape)"
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:'2px 5px', borderRadius:3, fontSize:16, lineHeight:1, marginLeft:2 }}
              onMouseEnter={e => ((e.currentTarget).style.background='rgba(255,255,255,0.1)')}
              onMouseLeave={e => ((e.currentTarget).style.background='none')}>✕</button>
          </div>
        )}

        {/* Scrollable log */}
        <div style={{ height:'100%', overflowY:'auto', background:'#0a0a0a', fontFamily:'Geist Mono,monospace' }}>
          {loading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'rgba(255,255,255,0.25)', fontSize:12 }}>Loading…</div>}
          {error   && <div style={{ padding:20, color:'#fc8181', fontSize:12 }}>{error}</div>}
          {!loading && lines.length===0 && <div style={{ padding:40, color:'rgba(255,255,255,0.25)', fontSize:12, textAlign:'center' }}>Empty file</div>}

          {!loading && view.map((item, vi) => {
            if (item.type === 'collapsed') {
              return (
                <div key={`c-${vi}`} style={{ display:'flex', alignItems:'center', gap:10, padding:'3px 0', background:'rgba(255,255,255,0.02)', borderTop:'1px solid rgba(255,255,255,0.05)', borderBottom:'1px solid rgba(255,255,255,0.05)', userSelect:'none' }}>
                  <span style={{ minWidth:58, textAlign:'right', padding:'0 8px', fontSize:11, color:'rgba(255,255,255,0.15)', borderRight:'1px solid rgba(255,255,255,0.05)' }}>·</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)', fontStyle:'italic' }}>··· {item.count.toLocaleString()} lines hidden ···</span>
                </div>
              )
            }

            const { line, matchIdx } = item
            const isCurrent = matchIdx !== null && matchIdx === currentMatch
            const isMatch   = matchIdx !== null
            const bg = isCurrent ? 'rgba(255,149,0,0.18)' : isMatch ? 'rgba(251,191,36,0.07)' : bgLine(line.text)

            return (
              <div key={line.lineNumber}
                ref={el => { if (matchIdx !== null) { if (el) matchRefs.current.set(matchIdx, el); else matchRefs.current.delete(matchIdx) } }}
                style={{ display:'flex', alignItems:'flex-start', background: bg || 'transparent', borderLeft: isCurrent ? '2px solid #ff9500' : bgLine(line.text) ? `2px solid ${colorLine(line.text)}` : '2px solid transparent' }}>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)', minWidth:58, padding:'2px 8px 2px 6px', textAlign:'right', flexShrink:0, userSelect:'none', lineHeight:'1.8', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
                  {line.lineNumber}
                </span>
                <span style={{ fontSize:12, color: colorLine(line.text), padding:'2px 14px 2px 10px', lineHeight:'1.8', wordBreak:'break-all', whiteSpace:'pre-wrap', flex:1 }}>
                  <Highlight text={line.text} term={searchTerm} cur={isCurrent} />
                </span>
              </div>
            )
          })}

          {!searchTerm && <div ref={sentinelRef} style={{ height:20 }} />}
          {loadingMore && <div style={{ textAlign:'center', padding:12, color:'rgba(255,255,255,0.25)', fontSize:11 }}>Loading…</div>}
          {!loading && !loadingMore && !loadingAll && page >= totalPages && lines.length > 0 && (
            <div style={{ textAlign:'center', padding:16, color:'rgba(255,255,255,0.15)', fontSize:11 }}>── end of file ──</div>
          )}
        </div>
      </div>
    </div>
  )
}
