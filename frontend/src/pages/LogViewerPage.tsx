import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'

// Colorize a log line based on content
function colorLine(text: string): string {
  if (/R5Check happens|!!! R5Check/.test(text)) return 'var(--red)'
  if (/Memory leak suspected/.test(text)) return 'var(--amber)'
  if (/Error:/.test(text)) return '#ff6b6b'
  if (/Warning:/.test(text)) return '#ffa94d'
  if (/\[Callstack\]/.test(text)) return 'var(--text-3)'
  if (/Display:/.test(text)) return 'var(--text-2)'
  return 'var(--text-2)'
}

function bgLine(text: string): string {
  if (/R5Check happens|!!! R5Check/.test(text)) return 'rgba(255,80,80,0.06)'
  if (/Memory leak suspected/.test(text)) return 'rgba(255,180,0,0.06)'
  return 'transparent'
}

// Highlight search term in text
function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--amber)', color: '#000', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  )
}

export function LogViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [fileName, setFileName] = useState('')
  const [lines,    setLines]    = useState<{ lineNumber: number; text: string }[]>([])
  const [page,     setPage]     = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLines, setTotalLines] = useState(0)
  const [pageSize,   setPageSize]   = useState(500)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [filter,   setFilter]   = useState('')
  const [inputVal, setInputVal] = useState('')
  const [filtered, setFiltered] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((p: number, f: string) => {
    if (!id) return
    setLoading(true)
    setError(null)
    api.files.raw(id, p, f || undefined)
      .then(r => {
        setFileName(r.fileName)
        setLines(r.lines)
        setPage(r.page)
        setTotalPages(r.totalPages)
        setTotalLines(r.totalLines)
        setPageSize(r.pageSize)
        setFiltered(r.filtered)
        topRef.current?.scrollTo(0, 0)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load(1, '') }, [load])

  function handleFilterInput(v: string) {
    setInputVal(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setFilter(v)
      load(1, v)
    }, 400)
  }

  function clearFilter() {
    setInputVal('')
    setFilter('')
    load(1, '')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link to={`/files/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>
        <div style={{ fontFamily: 'Geist Mono,monospace', fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {fileName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
          {filtered ? `${totalLines} matches` : `${totalLines.toLocaleString()} lines`}
        </div>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="input" value={inputVal} onChange={e => handleFilterInput(e.target.value)}
            placeholder="Filter lines…" style={{ paddingLeft: 26, width: 200, fontSize: 11 }} />
          {inputVal && (
            <button onClick={clearFilter} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: 0 }}>✕</button>
          )}
        </div>
      </div>

      {/* Log content */}
      <div ref={topRef} style={{ flex: 1, overflow: 'auto', background: '#0d0d0d' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 12 }}>
            <span className="animate-pulse">Loading…</span>
          </div>
        )}
        {error && (
          <div style={{ padding: '20px 28px', color: 'var(--red)', fontSize: 12, fontFamily: 'Geist Mono,monospace' }}>
            {error}
          </div>
        )}
        {!loading && !error && lines.length === 0 && (
          <div style={{ padding: '40px 28px', color: 'var(--text-3)', fontSize: 12, textAlign: 'center' }}>
            {filtered ? 'No lines match the filter' : 'Empty file'}
          </div>
        )}
        {!loading && lines.map((line, i) => (
          <div key={line.lineNumber}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 0,
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              borderLeft: bgLine(line.text) !== 'transparent' ? `2px solid ${colorLine(line.text)}` : '2px solid transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}>
            {/* Line number */}
            <span style={{
              fontFamily: 'Geist Mono,monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)',
              minWidth: 52, padding: '2px 10px 2px 6px', textAlign: 'right', flexShrink: 0,
              userSelect: 'none', lineHeight: '1.7',
            }}>
              {line.lineNumber}
            </span>
            {/* Text */}
            <span style={{
              fontFamily: 'Geist Mono,monospace', fontSize: 11,
              color: colorLine(line.text),
              padding: '2px 16px 2px 0', lineHeight: '1.7',
              wordBreak: 'break-all', whiteSpace: 'pre-wrap', flex: 1,
            }}>
              {highlight(line.text, filter)}
            </span>
          </div>
        ))}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && !loading && (
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono,monospace' }}>
            Lines {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, totalLines).toLocaleString()} of {totalLines.toLocaleString()}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => load(page - 1, filter)} style={{ fontSize: 11, padding: '4px 10px' }}>← Prev</button>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono,monospace', padding: '0 8px' }}>
              {page} / {totalPages}
            </span>
            <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => load(page + 1, filter)} style={{ fontSize: 11, padding: '4px 10px' }}>Next →</button>
            {/* Jump to page */}
            <input type="number" min={1} max={totalPages}
              defaultValue={page} key={page}
              onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (v >= 1 && v <= totalPages) load(v, filter) }}}
              style={{ width: 52, fontSize: 11, padding: '4px 6px', fontFamily: 'Geist Mono,monospace',
                background: 'var(--bg-2,#111)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', textAlign: 'center' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
