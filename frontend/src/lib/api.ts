import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

// ---------------------------------------------------------------------------
// Clerk token provider — registered by useAuth (ClerkTokenSync component)
// ---------------------------------------------------------------------------
let _tokenProvider: (() => Promise<string | null>) | null = null

/** Called once by ClerkTokenSync to wire Clerk's getToken into Axios. */
export function setTokenProvider(fn: () => Promise<string | null>) {
  _tokenProvider = fn
}

// Inject Clerk JWT on every request (async interceptor)
api.interceptors.request.use(async (config) => {
  const token = _tokenProvider ? await _tokenProvider() : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to /login on 401 — Clerk will handle re-authentication
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Typed helpers ────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ access_token: string; token_type: string; expires_in: number }>(
      '/auth/token',
      { username, password }
    ),
  me: () => api.get<{ username: string; role: string }>('/auth/me'),
}

// ── Graph format helpers ─────────────────────────────────────────────────
// Backend returns flat GraphNode {id, label, properties, risk_level}.
// Frontend expects Cytoscape-style {data: {id, type, label, risk_level, ...props}}.

export interface CyNode {
  data: {
    id: string
    label: string
    type: string
    risk_level?: string | null
    [k: string]: unknown
  }
}
export interface CyEdge {
  data: { id: string; source: string; target: string; rel: string; risk_level?: string | null }
}
export interface CyGraph {
  nodes:      CyNode[]
  edges:      CyEdge[]
  node_count: number
  edge_count: number
}

function tocy(raw: { nodes: unknown[]; edges: unknown[]; node_count: number; edge_count: number }): CyGraph {
  const nodes: CyNode[] = (raw.nodes as Array<{ id: string; label: string; properties?: Record<string, unknown>; risk_level?: string | null }>).map(n => ({
    data: {
      id:        n.id,
      type:      n.label,          // "Taxpayer" / "Invoice" / etc.
      label:     ((n.properties?.legal_name ?? n.properties?.invoice_no ?? n.id) as string),
      risk_level: n.risk_level,
      ...n.properties,
    },
  }))
  const edges: CyEdge[] = (raw.edges as Array<{ id: string; source: string; target: string; label: string; properties?: Record<string, unknown>; risk_level?: string | null }>).map(e => ({
    data: { id: e.id, source: e.source, target: e.target, rel: e.label, risk_level: e.risk_level },
  }))
  return { nodes, edges, node_count: raw.node_count, edge_count: raw.edge_count }
}

export const graphApi = {
  stats: () => api.get<Record<string, unknown>>('/graph/stats'),

  overview: (limit = 30) =>
    api.get<{ nodes: unknown[]; edges: unknown[]; node_count: number; edge_count: number }>(
      `/graph/overview?limit=${limit}`
    ).then(r => ({ ...r, data: tocy(r.data) })),

  subgraph: (gstin: string, depth = 1) =>
    api.get<{ nodes: unknown[]; edges: unknown[]; node_count: number; edge_count: number }>(
      `/graph/subgraph/${gstin}?depth=${depth}`
    ).then(r => ({ ...r, data: tocy(r.data) })),
}

export const reconcileApi = {
  run:   (body: Record<string, unknown> = {}) => api.post('/reconcile/run', body),
  stats: () => api.get('/reconcile/stats'),
}

export const invoicesApi = {
  list:   (params: Record<string, unknown>) => api.get('/invoices/', { params }),
  detail: (id: string) => api.get(`/invoices/${id}`),
}

export const vendorsApi = {
  list:     (params?: Record<string, unknown>) => api.get('/vendors/', { params }),
  profile:  (gstin: string) => api.get(`/vendors/${gstin}`),
  score:    () => api.post('/vendors/score'),
  train:    () => api.post('/vendors/train'),
  scoreOne: (gstin: string) => api.post(`/vendors/${gstin}/score`),
}

export const patternsApi = {
  all:        () => api.get('/patterns/'),
  circular:   () => api.get('/patterns/circular-trades'),
  delays:     () => api.get('/patterns/payment-delays'),
  amendments: () => api.get('/patterns/amendment-chains'),
  networks:   () => api.get('/patterns/risk-networks'),
}

export const uploadApi = {
  taxpayers:   (file: File) => upload('/upload/taxpayers', file),
  invoices:    (file: File) => upload('/upload/invoices', file),
  gstr1:       (file: File) => upload('/upload/gstr1', file),
  gstr2b:      (file: File) => upload('/upload/gstr2b', file),
  gstr3b:      (file: File) => upload('/upload/gstr3b', file),
  taxPayments: (file: File) => upload('/upload/tax-payments', file),
}

export const chatApi = {
  sendMessage: (message: string, language: string = 'en', session_id?: string) =>
    api.post('/chat/message', { message, language, session_id }),
  clearSession: (session_id: string) =>
    api.delete(`/chat/session/${session_id}`),
  health: () =>
    api.get('/chat/health'),
}

export const whatsappApi = {
  send: (to: string, message: string) =>
    api.post('/whatsapp/send', { to, message }),
  sendReport: (to: string, analysis: Record<string, unknown>) =>
    api.post('/whatsapp/send-report', { to, analysis }),
}

export const sessionApi = {
  /** Call this before clerk.signOut() to delete all Neo4j data for the user. */
  deleteSession: () => api.delete('/session'),
}

export { api }

function upload(url: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
