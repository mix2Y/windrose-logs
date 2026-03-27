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
  return ''
}

// Highlight all occurrences of term in text
function highlight(text: string, term: string, isCurrentMatch: boolean): React.ReactNode {
  if (!term) return text
  const lower = text.toLowerCase()
  const termLower = term.toLowerCase()
  const parts: React.ReactNode[] = []
  let last = 0, idx = 0
  while ((idx = lower.indexOf(termLower, last)) !== -1) {
    if (idx > last) parts.push(text.slice(last, idx))
    parts.push(
      <mark key={idx} style={{
        background: isCurrentMatch ? '#ff9500' : '#fbbf24',
        color: '#000', borderRadius: 2, padding: '0 1px',
      }}>
        {text.slice(idx, idx + term.length)}
      </mark>
    )
    last = idx + term.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? <>{parts}</> : text
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

  // Search state — does NOT filter lines, only highlights
  const [searchTerm, setSearchTerm] = useState('')
  const [inputVal, setInputVal]     = useState('')
  const [matchIndices, setMatchIndices] = useState<number[]>([])  // indices into lines[]
  const [currentMatch, setCurrentMatch] = useState(0)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load pages — no filter, always load all lines
  const loadPage = useCallback(async (p: number, reset: boolean) => {
    if (!id) return
    if (reset) { setLoading(true); setError(null); setLines([]) }
    else setLoadingMore(true)
    try {
      const r = await api.files.raw(id, p)  // no filter — always get all lines
      setFileName(r.fileName)
      setLines(prev => reset ? r.lines : [...prev, ...r.lines])
      setPage(p)
      setTotalPages(r.totalPages)
      setTotalLines(r.totalLines)
    } catch (e) { setError(String(e)) }
    finally { reset ? setLoading(false) : setLoadingMore(false) }
  }, [id])

  useEffect(() => { loadPage(1, true) }, [loadPage])

  const loadMore = useCallback(() => {
    if (page < totalPages && !loadingMore && !loading) loadPage(page + 1, false)
  }, [page, totalPages, loadingMore, loading, loadPage])

  const sentinelRef = useInfiniteScroll(loadMore, page < totalPages && !loadingMore && !loading)

  // Recompute match indices when searchTerm or lines change
  useEffect(() => {
    if (!searchTerm) { setMatchIndices([]); setCurrentMatch(0); return }
    const term = searchTerm.toLowerCase()
    const indices = lines.reduce<number[]>((acc, line, i) => {
      if (line.text.toLowerCase().includes(term)) acc.push(i)
      return acc
    }, [])
    setMatchIndices(indices)
    setCurrentMatch(0)
  }, [searchTerm, lines])

  // Scroll to current match
  useEffect(() => {
    if (matchIndices.length === 0) return
    const idx = matchIndices[currentMatch]
    const el = lineRefs.current[idx]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentMatch, matchIndices])

  function handleSearchInput(v: string) {
    setInputVal(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearchTerm(v), 250)
  }

  function clearSearch() { setInputVal(''); setSearchTerm('') }

  function goNext() { setCurrentMatch(c => matchIndices.length ? (c + 1) % matchIndices.length : 0) }
  function goPrev() { setCurrentMatch(c => matchIndices.length ? (c - 1 + matchIndices.length) % matchIndices.length : 0) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.shiftKey ? goPrev() : goNext() }
    if (e.key === 'Escape') clearSearch()
  }

  const matchCount = matchIndices.length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>
      {/* Header */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)', background:'#111', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <Link to={`/files/${id}`} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'rgba(255,255,255,0.4)', textDecoration:'none', flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>
        <div style={{ fontFamily:'Geist Mono,monospace', fontSize:12, color:'rgba(255,255,255,0.65)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {fileName}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', flexShrink:0, whiteSpace:'nowrap' }}>
          {totalLines.toLocaleString()} lines{page < totalPages ? ` · ${lines.length.toLocaleString()} loaded` : ''}
        </div>

        {/* VS Code-style search bar */}
        <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:5, padding:'3px 6px', flexShrink:0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={inputVal}
            onChange={e => handleSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find…"
            style={{ width:180, fontSize:12, background:'none', border:'none', color:'rgba(255,255,255,0.85)', outline:'none', fontFamily:'Geist Mono,monospace' }}
          />
          {/* Match counter */}
          {searchTerm && (
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', whiteSpace:'nowrap', minWidth:50, textAlign:'right' }}>
              {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : 'No results'}
            </span>
          )}
          {/* Prev/Next */}
          {matchCount > 0 && <>
            <button onClick={goPrev} title="Previous (Shift+Enter)" style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', padding:'1px 3px', fontSize:13, lineHeight:1 }}>↑</button>
            <button onClick={goNext} title="Next (Enter)"           style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', padding:'1px 3px', fontSize:13, lineHeight:1 }}>↓</button>
          </>}
          {inputVal && (
            <button onClick={clearSearch} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.3)', padding:'1px 3px', fontSize:14, lineHeight:1 }}>✕</button>
          )}
        </div>
      </div>

      {/* Log content */}
      <div style={{ flex:1, overflowY:'auto', background:'#0a0a0a', fontFamily:'Geist Mono,monospace' }}>
        {loading && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'rgba(255,255,255,0.25)', fontSize:12 }}>Loading…</div>}
        {error   && <div style={{ padding:20, color:'#fc8181', fontSize:12 }}>{error}</div>}
        {!loading && !error && lines.length === 0 && <div style={{ padding:40, color:'rgba(255,255,255,0.25)', fontSize:12, textAlign:'center' }}>Empty file</div>}

        {!loading && lines.map((line, i) => {
          const isMatch   = searchTerm ? line.text.toLowerCase().includes(searchTerm.toLowerCase()) : false
          const isCurrent = isMatch && matchIndices[currentMatch] === i
          const bg = isCurrent
            ? 'rgba(255,149,0,0.18)'
            : isMatch
              ? 'rgba(251,191,36,0.08)'
              : bgLine(line.text) || (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)')

          return (
            <div key={line.lineNumber}
              ref={el => { lineRefs.current[i] = el }}
              style={{ display:'flex', alignItems:'flex-start', background: bg, borderLeft: isCurrent ? '2px solid #ff9500' : bgLine(line.text) ? `2px solid ${colorLine(line.text)}` : '2px solid transparent' }}
              onMouseEnter={e => { if (!isCurrent && !isMatch) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = bg }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)', minWidth:56, padding:'2px 8px 2px 6px', textAlign:'right', flexShrink:0, userSelect:'none', lineHeight:'1.8', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
                {line.lineNumber}
              </span>
              <span style={{ fontSize:12, color: colorLine(line.text), padding:'2px 14px 2px 10px', lineHeight:'1.8', wordBreak:'break-all', whiteSpace:'pre-wrap', flex:1 }}>
                {highlight(line.text, searchTerm, isCurrent)}
              </span>
            </div>
          )
        })}

        <div ref={sentinelRef} style={{ height:20 }} />
        {loadingMore && <div style={{ textAlign:'center', padding:12, color:'rgba(255,255,255,0.25)', fontSize:11 }}>Loading…</div>}
        {!loading && !loadingMore && page >= totalPages && lines.length > 0 && (
          <div style={{ textAlign:'center', padding:16, color:'rgba(255,255,255,0.15)', fontSize:11 }}>── end of file ──</div>
        )}
      </div>
    </div>
  )
}
