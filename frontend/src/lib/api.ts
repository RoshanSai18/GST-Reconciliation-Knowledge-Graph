import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

// Inject JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gst_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to /login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gst_token')
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

export const graphApi = {
  stats:    () => api.get<Record<string, unknown>>('/graph/stats'),
  subgraph: (gstin: string, depth = 1) =>
    api.get<{ nodes: unknown[]; edges: unknown[]; node_count: number; edge_count: number }>(
      `/graph/subgraph/${gstin}?depth=${depth}`
    ),
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

function upload(url: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
