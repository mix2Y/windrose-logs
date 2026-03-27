import { useEffect, useRef, useCallback } from 'react'

export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const cb = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && enabled) onLoadMore()
  }, [onLoadMore, enabled])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(cb, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [cb])

  return sentinelRef
}
