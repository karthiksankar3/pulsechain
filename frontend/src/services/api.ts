import axios, { type AxiosInstance } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

const getSessionId = () => localStorage.getItem('pulsechain_session_id') || 'demo'

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  const sessionId = getSessionId()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  config.headers['X-Session-ID'] = sessionId
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
    }
    return Promise.reject(error)
  },
)

export default api

// ------------------------------------------------------------------ //
// Auth                                                                 //
// ------------------------------------------------------------------ //
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; token_type: string }>('/auth/login', {
      username: email,
      password,
    }),
  register: (email: string, password: string, fullName?: string) =>
    api.post('/auth/register', { email, password, full_name: fullName }),
  me: () => api.get('/auth/me'),
}

// ------------------------------------------------------------------ //
// Forecasting                                                          //
// ------------------------------------------------------------------ //

export interface HistoricalPoint {
  date: string
  actual: number
}

export interface ForecastChartPoint {
  date: string
  forecast: number
  lower: number
  upper: number
}

export interface SKUChartData {
  sku_id: number
  sku_name: string
  atc_code: string
  model_name: string
  historical: HistoricalPoint[]
  forecast: ForecastChartPoint[]
  mape: number | null
}

export interface ModelAccuracy {
  model_name: string
  mape: number
  wmape: number
  mae: number
  rmse: number
  bias: number
  sample_size: number
}

export interface SKUAccuracy {
  sku_id: number
  models: ModelAccuracy[]
}

export interface PortfolioItem {
  id: number
  name: string
  atc_code: string
  therapy_area: string | null
  latest_forecast_28days: number | null
  mape: number | null
  trend_direction: string | null
}

export interface SKUResponse {
  id: number
  name: string
  atc_code: string
  therapy_area: string | null
}

export const forecastApi = {
  listSkus: () => api.get<SKUResponse[]>('/forecasting/skus'),

  runForecast: (skuId: number, modelName: string, horizonDays: number) =>
    api.post('/forecasting/run', {
      sku_id: skuId,
      model_name: modelName,
      horizon_days: horizonDays,
    }),

  getLatest: (skuId: number, modelName: string, horizonDays = 90) =>
    api.get<SKUChartData>(`/forecasting/skus/${skuId}/latest`, {
      params: { model_name: modelName, horizon_days: horizonDays },
    }),

  getAccuracy: (skuId: number) =>
    api.get<SKUAccuracy>(`/forecasting/skus/${skuId}/accuracy`),

  getPortfolio: () => api.get<PortfolioItem[]>('/forecasting/portfolio'),
}

// ------------------------------------------------------------------ //
// Inventory                                                            //
// ------------------------------------------------------------------ //

export interface InventoryHealthData {
  total_skus: number
  stockout_risk_count: number
  expiry_risk_count: number
  overstock_count: number
  low_stock_count: number
  avg_dos: number
  total_inventory_value: number
}

export interface InventorySKU {
  sku_id: number
  sku_name: string
  atc_code: string
  therapy_area: string | null
  dos: number
  safety_stock: number
  stockout_probability_30d: number
  expiry_risk_score: number
  units_at_risk: number
  days_until_expiry: number | null
  expiry_date: string | null
  abc_class: string
  xyz_class: string
  cv: number
  current_stock: number
  status: 'CRITICAL' | 'AT RISK' | 'HEALTHY'
}

export interface ABCXYZItem {
  sku_id: number
  sku_name: string
  atc_code: string
  abc_class: string
  xyz_class: string
  cv: number
  revenue_contribution_pct: number
}

export interface SafetyStockResult {
  safety_stock_units: number
  service_level: number
  lead_time_days: number
  demand_std: number
  sku_name?: string
  atc_code?: string
  explanation?: string
}

export interface SKUDetail {
  sku_id: number
  sku_name: string
  atc_code: string
  therapy_area: string | null
  current_stock: number
  dos: number
  safety_stock: {
    '90pct': SafetyStockResult
    '95pct': SafetyStockResult
    '99pct': SafetyStockResult
  }
  stockout_probability: {
    '30d': number
    '60d': number
    '90d': number
  }
  expiry_risk: {
    risk_score: number
    units_at_risk: number
    days_until_expiry: number | null
    expiry_date: string | null
  }
  abc_xyz: ABCXYZItem
}

export const inventoryApi = {
  getHealth: () => api.get<InventoryHealthData>('/inventory/health'),
  listSKUs: () => api.get<InventorySKU[]>('/inventory/skus'),
  getSKUDetail: (skuId: number) => api.get<SKUDetail>(`/inventory/skus/${skuId}`),
  getABCXYZ: () => api.get<ABCXYZItem[]>('/inventory/abc-xyz'),
  getSafetyStock: (skuId: number, serviceLevel = 0.95) =>
    api.get<SafetyStockResult>(`/inventory/safety-stock/${skuId}`, {
      params: { service_level: serviceLevel },
    }),
}

// ------------------------------------------------------------------ //
// Social / PharmaPulse                                                //
// ------------------------------------------------------------------ //

export interface TickerItem {
  text: string
  type: 'trend' | 'news' | 'reddit'
  sentiment: 'positive' | 'negative' | 'neutral'
}

export interface WeeklyChartPoint { date: string; score: number }

export interface TherapySignal {
  therapy_area: string
  final_score: number
  trends_contribution: number
  reddit_contribution: number
  news_contribution: number
  trends_score: number
  reddit_score: number
  news_score: number
  trend_direction: 'up' | 'down' | 'stable'
  top_term: string
  weekly_chart: WeeklyChartPoint[]
  forecast_adjustment_pct: number
}

export interface NewsHeadline {
  title: string
  source: string
  published_at: string
  url: string
  signal_type: 'outbreak' | 'policy' | 'shortage' | 'launch' | 'general'
  description: string
  time_ago: string
}

export interface NewsSummary {
  outbreak_count: number
  policy_count: number
  shortage_count: number
  launch_count: number
  total: number
  top_headlines: NewsHeadline[]
}

export interface OutbreakSignal {
  term: string
  mention_count: number
  signal_strength: number
  sample_posts: string[]
}

export interface DrugSentiment {
  drug_name: string
  total_mentions: number
  positive_pct: number
  negative_pct: number
  neutral_pct: number
  top_posts: { title: string; subreddit: string; score: number; sentiment_score: number }[]
}

export interface ForecastAdjustment {
  sku_id: number
  sku_name: string
  atc_code: string
  therapy_area: string
  signal_score: number
  adjustment_pct: number
  confidence: string
  reasoning: string
}

export const socialApi = {
  getTicker: () => api.get<TickerItem[]>('/social/ticker'),
  getSignals: () => api.get<TherapySignal[]>('/social/signals'),
  getTrends: () => api.get<Record<string, { date: string; value: number }[]>>('/social/trends'),
  getNews: () => api.get<NewsSummary>('/social/news'),
  getReddit: () =>
    api.get<{ outbreak_signals: OutbreakSignal[]; drug_sentiments: DrugSentiment[] }>('/social/reddit'),
  getForecastAdjustments: () => api.get<ForecastAdjustment[]>('/social/forecast-adjustments'),
}

// ------------------------------------------------------------------ //
// Scenario Planning                                                   //
// ------------------------------------------------------------------ //

export interface ScenarioTemplate {
  description: string
  demand_impact: number
  icon: string
}

export interface ScenarioResult {
  scenario_type: string
  sku_id: number
  sku_name: string
  atc_code: string
  description: string
  impact_pct: number
  baseline_forecast: { date: string; quantity: number }[]
  scenario_forecast: { date: string; quantity: number }[]
  delta_units: number
  delta_pct: number
}

export const scenarioApi = {
  getTemplates: () => api.get<Record<string, ScenarioTemplate>>('/scenarios/templates'),
  runScenario: (skuId: number, scenarioType: string, customImpactPct?: number | null) =>
    api.post<ScenarioResult>('/scenarios/run', {
      sku_id: skuId,
      scenario_type: scenarioType,
      custom_impact_pct: customImpactPct ?? null,
    }),
  compareScenarios: (skuId: number, scenarioTypes: string[]) =>
    api.post('/scenarios/compare', { sku_id: skuId, scenario_types: scenarioTypes }),
}

// ------------------------------------------------------------------ //
// S&OP Console                                                        //
// ------------------------------------------------------------------ //

export interface ConsensusRow {
  sku_id: number
  drug_name: string
  atc_code: string
  therapy_area: string
  statistical_forecast: number
  field_forecast: number
  consensus_forecast: number
  variance_pct: number
  status: 'ALIGNED' | 'REVIEW NEEDED' | 'ESCALATE'
}

export interface ForecastVersion {
  version: number
  model: string
  created_at: string
  mape: number | null
  forecast_28day_total: number | null
}

export interface VersionRow {
  sku_id: number
  sku_name: string
  atc_code: string
  versions: ForecastVersion[]
  accuracy_trend: string
}

export interface SkuMape { sku_id: number; sku_name: string; avg_mape: number }

export interface AccuracyScorecard {
  overall_mape: number | null
  best_model: string
  most_improved_sku: string | null
  sku_mapes: SkuMape[]
}

export interface CalendarEntry {
  cycle: number
  week_of: string
  week_end: string
  phase: string
  description: string
  status: 'completed' | 'active' | 'upcoming'
  phase_index: number
}

export const sopApi = {
  getConsensus: () => api.get<ConsensusRow[]>('/sop/consensus'),
  getVersions: () => api.get<VersionRow[]>('/sop/versions'),
  getAccuracy: () => api.get<AccuracyScorecard>('/sop/accuracy'),
  getCalendar: () => api.get<CalendarEntry[]>('/sop/calendar'),
  exportSap: () =>
    api.get('/sop/export', { responseType: 'blob' }),
}

// ------------------------------------------------------------------ //
// Upload                                                              //
// ------------------------------------------------------------------ //

export interface UploadResponse {
  file_id: string
  filename: string
  row_count: number
  detected_columns: string[]
  date_range: string | null
  preview: Record<string, unknown>[]
}

export interface MapColumnsResponse {
  valid: boolean
  errors: string[]
  preview: Record<string, unknown>[]
}

export interface IngestResponse {
  skus_created: number
  records_inserted: number
  date_range: string
  organization: string
}

export interface CurrentDatasetInfo {
  source: 'demo' | 'custom'
  filename?: string
  sku_count: number
  record_count: number
  date_range_start: string
  date_range_end: string
  uploaded_at: string | null
}

export const uploadApi = {
  uploadFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<UploadResponse>('/upload/csv', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  mapColumns: (fileId: string, columnMapping: Record<string, string>) =>
    api.post<MapColumnsResponse>('/upload/map-columns', {
      file_id: fileId,
      column_mapping: columnMapping,
    }),
  ingest: (fileId: string, columnMapping: Record<string, string>, organizationName: string) =>
    api.post<IngestResponse>('/upload/ingest', {
      file_id: fileId,
      column_mapping: columnMapping,
      organization_name: organizationName,
    }),
  downloadTemplate: () =>
    api.get('/upload/template', { responseType: 'blob' }),
  getCurrentDataset: () =>
    api.get<CurrentDatasetInfo>('/upload/current-dataset'),
  resetToDemo: () =>
    api.post<{ message: string; skus_created: number; records_inserted: number }>('/upload/reset-demo'),
}
