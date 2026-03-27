import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../lib/auth'

export function LoginPage() {
  const { instance } = useMsal()

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle dot grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />
      {/* Warm glow center */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 500, height: 300,
        background: 'radial-gradient(ellipse, rgba(180,83,9,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="animate-fade-in" style={{
        background: 'var(--bg-1)', borderRadius: 12,
        border: '1px solid var(--border)',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 40px -4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.02)',
        padding: '44px 40px', width: 380, position: 'relative',
      }}>
        {/* Top rule */}
        <div style={{
          position: 'absolute', top: 0, left: '15%', right: '15%', height: 2,
          background: 'linear-gradient(90deg, transparent, var(--amber), transparent)',
          borderRadius: '0 0 2px 2px',
        }} />
        {/* Logo mark */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 10,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            marginBottom: 16, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.7">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            Windrose Logs
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, letterSpacing: '0.04em' }}>
            Game Log Analyzer
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 24px' }} />

        <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', margin: '0 0 22px', lineHeight: 1.6 }}>
          Sign in with your Sundrift Games corporate account to continue.
        </p>

        <button
          onClick={() => instance.loginRedirect(loginRequest)}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 14px', fontSize: 13.5, borderRadius: 8 }}
        >
          <svg width="15" height="15" viewBox="0 0 21 21" fill="currentColor">
            <path d="M10 0H0v10h10V0zM21 0H11v10h10V0zM10 11H0v10h10V11zM21 11H11v10h10V11z"/>
          </svg>
          Continue with Microsoft
        </button>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>
          Sundrift Games · Internal Tool · v0.1
        </div>
      </div>
    </div>
  )
}
