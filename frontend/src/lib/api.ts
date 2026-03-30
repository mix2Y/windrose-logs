import { msalInstance, loginRequest } from './auth'

async function getToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts()
  if (!accounts.length) throw new Error('Not authenticated')
  const result = await msalInstance.acquireTokenSilent({
    ...loginRequest,
    account: accounts[0],
  })
  return result.accessToken
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let token: string
  try {
    token = await getToken()
  } catch {
    // Not authenticated — let caller handle it
    throw new Error('Not authenticated')
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface SignatureSummary {
  id: string
  conditionText: string
  whereText: string
  sourceFile: string
  totalCount: number
  fileCount: number
  firstSeen: string
  lastSeen: string
}

export interface EventDetail {
  id: number
  timestamp: string
  frameNumber: number
  checkCondition: string
  checkMessage: string | null
  checkWhere: string
  checkSourceFile: string
  callstack: string[]
  file: { id: string; fileName: string; sessionDate: string | null }
}

export interface LogFileDto {
  id: string
  fileName: string
  source: string
  sessionDate: string | null
  uploadedAt: string
  status: string
  eventsFound: number
  errorMessage?: string | null
  uploaderName?: string | null
}

export interface MemoryLeakSig {
  id: string
  conditionText: string
  totalCount: number
  fileCount: number
  firstSeen: string
  lastSeen: string
}

export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: string
  createdAt: string
  lastLoginAt: string | null
}

export interface AdminStats {
  filesTotal: number
  filesDone: number
  filesError: number
  eventsTotal: number
  signaturesTotal: number
  usersTotal: number
  byEventType: { eventType: string; count: number }[]
}

export const api = {
  r5checks: {
    summary: (params?: { dateFrom?: string; dateTo?: string; fileId?: string }) => {
      const p = new URLSearchParams()
      if (params?.dateFrom) p.set('dateFrom', params.dateFrom)
      if (params?.dateTo)   p.set('dateTo',   params.dateTo)
      if (params?.fileId)   p.set('fileId',   params.fileId)
      return request<SignatureSummary[]>(`/r5checks/summary?${p}`)
    },
    popular: (top = 5) => request<SignatureSummary[]>(`/r5checks/popular?top=${top}`),
    unique:  () => request<SignatureSummary[]>('/r5checks/unique'),
    details: (id: string, page = 1, fileId?: string) => {
      const p = new URLSearchParams({ page: String(page) })
      if (fileId) p.set('fileId', fileId)
      return request<{ signature: SignatureSummary; events: EventDetail[]; page: number }>(
        `/r5checks/${id}?${p}`
      )
    },
    search: (q: string, page = 1) =>
      request<SignatureSummary[]>(`/r5checks/search?q=${encodeURIComponent(q)}&page=${page}`),
    timeline: (days = 30) =>
      request<{ date: string; count: number }[]>(`/r5checks/timeline?days=${days}`),
    newSince: (since: Date) =>
      request<{ id: string; conditionText: string; sourceFile: string; firstSeen: string; totalCount: number }[]>(
        `/r5checks/new-since?since=${since.toISOString()}`
      ),
  },

  memoryLeaks: {
    summary: () => request<MemoryLeakSig[]>('/memory-leaks/summary'),
    details: (id: string, page = 1) =>
      request<{ signature: MemoryLeakSig; events: unknown[]; page: number }>(
        `/memory-leaks/${id}?page=${page}`
      ),
    timeline: (days = 30) =>
      request<{ date: string; count: number; avgGrowthRate: number }[]>(
        `/memory-leaks/timeline?days=${days}`
      ),
  },

  admin: {
    stats:      () => request<AdminStats>('/admin/stats'),
    users:      () => request<AdminUser[]>('/admin/users'),
    setRole:    (id: string, role: string) =>
      request<{ id: string; role: string }>(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    deleteUser: (id: string) =>
      request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  },

  ingest: {
    upload: async (files: File | File[]) => {
      const token = await getToken()
      const arr = Array.isArray(files) ? files : [files]
      // single .log → /upload, multiple or zip → /upload-many
      if (arr.length === 1 && arr[0].name.endsWith('.log')) {
        const form = new FormData()
        form.append('file', arr[0])
        const res = await fetch('/api/ingest/upload', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
        })
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
        const data = await res.json()
        return Array.isArray(data.files) ? data.files : [data]
      }
      const form = new FormData()
      arr.forEach(f => form.append('files', f))
      const res = await fetch('/api/ingest/upload-many', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      return (data.files ?? [data]) as { fileId: string; fileName: string; status: string }[]
    },
    requeuePending: () => request<{ queued: number }>('/ingest/requeue-pending', { method: 'POST' }),
  },

  files: {
    list: (params?: { page?: number; pageSize?: number; dateFrom?: string; dateTo?: string; status?: string; search?: string }) => {
      const p = new URLSearchParams()
      if (params?.page)     p.set('page',     String(params.page))
      if (params?.pageSize) p.set('pageSize', String(params.pageSize))
      if (params?.dateFrom) p.set('dateFrom', params.dateFrom)
      if (params?.dateTo)   p.set('dateTo',   params.dateTo)
      if (params?.status)   p.set('status',   params.status)
      if (params?.search)   p.set('search',   params.search)
      return request<{ items: LogFileDto[]; total: number }>(`/files?${p.toString()}`)
    },
    details: (id: string) =>
      request<{
        file: LogFileDto
        eventCounts: { eventType: string; count: number }[]
        topSignatures: (SignatureSummary & { fileCount: number })[]
      }>(`/files/${id}`),
    raw: (id: string, page = 1, filter?: string) => {
      const p = new URLSearchParams({ page: String(page) })
      if (filter) p.set('filter', filter)
      return request<{
        fileName: string
        totalLines: number
        totalPages: number
        page: number
        pageSize: number
        filtered: boolean
        lines: { lineNumber: number; text: string }[]
      }>(`/files/${id}/raw?${p}`)
    },
  },
}
