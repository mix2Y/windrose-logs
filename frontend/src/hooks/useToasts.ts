import { useState, useCallback, useRef } from 'react'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info' | 'alert'
  title: string
  body?: string
  duration?: number
}

let _nextId = 1

// Global singleton so any component can push toasts
type ToastFn = (t: Omit<Toast, 'id'>) => void
let _push: ToastFn | null = null
export function pushToast(t: Omit<Toast, 'id'>) { _push?.(t) }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const add = useCallback((t: Omit<Toast, 'id'>) => {
    const id = _nextId++
    const duration = t.duration ?? (t.type === 'alert' ? 8000 : 4000)
    setToasts(prev => [...prev, { ...t, id }])
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id))
      delete timers.current[id]
    }, duration)
  }, [])

  // Register global push
  _push = add

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts(prev => prev.filter(x => x.id !== id))
  }, [])

  return { toasts, add, dismiss }
}
