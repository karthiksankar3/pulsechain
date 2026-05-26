import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; token_type: string }>('/auth/login', { username: email, password }),
  register: (email: string, password: string, fullName?: string) =>
    api.post('/auth/register', { email, password, full_name: fullName }),
  me: () => api.get('/auth/me'),
}

export const forecastApi = {
  run: (skuId: number, modelName?: string, horizonDays?: number) =>
    api.post('/forecasting/run', { sku_id: skuId, model_name: modelName, horizon_days: horizonDays }),
  getLatest: (skuId: number, modelName?: string) =>
    api.get(`/forecasting/skus/${skuId}/latest`, { params: { model_name: modelName } }),
  getHistory: (skuId: number, limit?: number) =>
    api.get(`/forecasting/skus/${skuId}/history`, { params: { limit } }),
}

export const inventoryApi = {
  getSnapshot: (skuId: number) => api.get(`/inventory/skus/${skuId}/snapshot`),
  getAlerts: () => api.get('/inventory/alerts'),
  getOverview: () => api.get('/inventory/overview'),
}

export const socialApi = {
  listSignals: (params?: { sku_id?: number; source?: string; limit?: number }) =>
    api.get('/social/signals', { params }),
  getSignalIndex: (skuId: number, days?: number) =>
    api.get(`/social/index/${skuId}`, { params: { days } }),
  refreshSignals: (skuId: number) => api.post(`/social/refresh/${skuId}`),
}
