import { NavLink } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )},
  { to: '/r5checks', label: 'R5 Checks', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )},
  { to: '/memory-leaks', label: 'Memory Leaks', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  )},
  { to: '/files', label: 'Log Files', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )},
  { to: '/admin', label: 'Admin', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4"/>
      <path d="M20 21a8 8 0 10-16 0"/>
      <path d="M19 8l-2 3h4l-2 3"/>
    </svg>
  )},
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const user = accounts[0]
  const initials = user?.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase() ?? '?'

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 216, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)', borderRight: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, letterSpacing: '-0.02em' }}>Windrose</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', fontFamily: 'Geist Mono, monospace' }}>LOGS</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px 8px', flex: 1 }}>
          {nav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 9px', borderRadius: 6, marginBottom: 1,
                  background: isActive ? 'var(--bg-2)' : 'transparent',
                  color: isActive ? 'var(--text)' : 'var(--text-3)',
                  fontSize: 13, fontWeight: isActive ? 500 : 400,
                  border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
                  transition: 'all 0.1s', cursor: 'pointer',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                }}>
                  <span style={{ color: isActive ? 'var(--amber)' : 'var(--text-3)', flexShrink: 0 }}>
                    {icon}
                  </span>
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: 'var(--amber)',
              }}>{initials}</div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name ?? 'User'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.username}
                </div>
              </div>
            </div>
            <button
              onClick={() => instance.logout()}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0 0',
                color: 'var(--text-3)', fontSize: 11.5, fontFamily: 'inherit',
                borderTop: '1px solid var(--border)', paddingTop: 7,
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
