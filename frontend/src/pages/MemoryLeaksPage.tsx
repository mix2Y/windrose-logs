import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, MemoryLeakSig } from '../lib/api'

export function MemoryLeaksPage() {
  const [data, setData]     = useState<MemoryLeakSig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.memoryLeaks.summary().then(setData).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text)' }}>Memory Leaks</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
          Detected memory growth events grouped by world
        </p>
      </div>

      <div style={{ padding: '20px 28px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr>
              <th>World / Description</th>
              <th style={{ textAlign: 'center' }}>Files</th>
              <th style={{ textAlign: 'right' }}>Count</th>
              <th style={{ textAlign: 'right' }}>First Seen</th>
              <th style={{ textAlign: 'right' }}>Last Seen</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                <span className="animate-pulse">Loading…</span>
              </td></tr>}
              {!loading && data.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                No memory leak events found in processed files
              </td></tr>}
              {!loading && data.map((s, i) => (
                <tr key={s.id} className="animate-fade-in" style={{ animationDelay: `${i * 15}ms` }}
                  onClick={() => (window.location.href = `/memory-leaks/${s.id}`)}>
                  <td>
                    <Link to={`/memory-leaks/${s.id}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                      {s.conditionText}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'center' }}><span className="badge badge-gray">{s.fileCount}</span></td>
                  <td style={{ textAlign: 'right' }}><span className="badge badge-amber">{s.totalCount}</span></td>
                  <td style={{ textAlign: 'right', fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>
                    {new Date(s.firstSeen).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Geist Mono,monospace', fontSize: 11 }}>
                    {new Date(s.lastSeen).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
