import { useToasts, Toast } from '../../hooks/useToasts'
import { Link } from 'react-router-dom'

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const isAlert = toast.type === 'alert'
  const color = toast.type === 'success' ? 'var(--green)'
              : toast.type === 'error'   ? 'var(--red)'
              : isAlert                  ? 'var(--amber)'
              : 'var(--blue)'
  return (
    <div className="animate-fade-in" style={{
      background: 'var(--bg-1)', border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`, borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)', padding: '12px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 280, maxWidth: 380,
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        {isAlert
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          : toast.type === 'success'
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          : toast.type === 'error'
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: toast.body ? 3 : 0 }}>
          {toast.title}
        </div>
        {toast.body && <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{toast.body}</div>}
        {isAlert && (
          <Link to="/r5checks" style={{ fontSize: 11, color, textDecoration: 'none', fontWeight: 500, marginTop: 5, display: 'inline-block' }} onClick={onDismiss}>
            View new signatures →
          </Link>
        )}
      </div>
      <button onClick={onDismiss} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, fontSize: 14, lineHeight: 1 }}>✕</button>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  if (!toasts.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  )
}
