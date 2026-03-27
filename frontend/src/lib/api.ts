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
  const token = await getToken()
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

// ── R5Checks ──────────────────────────────────────────────────────────────────

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
    unique: () => request<SignatureSummary[]>('/r5checks/unique'),
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
  },

  memoryLeaks: {
    summary: () => request<MemoryLeakSig[]>('/memory-leaks/summary'),
    details: (id: string, page = 1) =>
      request<{ signature: MemoryLeakSig; events: any[]; page: number }>(
        `/memory-leaks/${id}?page=${page}`
      ),
    timeline: (days = 30) =>
      request<{ date: string; count: number; avgGrowthRate: number }[]>(
        `/memory-leaks/timeline?days=${days}`
      ),
  },

  admin: {
    stats:   () => request<AdminStats>('/admin/stats'),
    users:   () => request<AdminUser[]>('/admin/users'),
    setRole: (id: string, role: string) =>
      request<{ id: string; role: string }>(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    deleteUser: (id: string) =>
      request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  },
    upload: async (file: File) => {
      const token = await getToken()
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ingest/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      return res.json() as Promise<{ fileId: string; jobId: string; status: string }>
    },
  },

  files: {
    list: (params?: { page?: number; dateFrom?: string; dateTo?: string; status?: string }) => {
      const p = new URLSearchParams()
      if (params?.page)     p.set('page',     String(params.page))
      if (params?.dateFrom) p.set('dateFrom', params.dateFrom)
      if (params?.dateTo)   p.set('dateTo',   params.dateTo)
      if (params?.status)   p.set('status',   params.status)
      return request<{ items: LogFileDto[]; total: number }>(`/files?${p.toString()}`)
    },
    details: (id: string) =>
      request<{
        file: LogFileDto
        eventCounts: { eventType: string; count: number }[]
        topSignatures: (SignatureSummary & { fileCount: number })[]
      }>(`/files/${id}`),
  },
}

export interface LogFileDto {
  id: string
  fileName: string
  source: string
  sessionDate: string | null
  uploadedAt: string
  status: string
  eventsFound: number
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
