import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
}

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'pulsechain-auth' },
  ),
)

interface UIState {
  sidebarOpen: boolean
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))

// ------------------------------------------------------------------ //
// Forecast store                                                       //
// ------------------------------------------------------------------ //

export interface SKU {
  id: number
  name: string
  atc_code: string
  therapy_area: string | null
}

interface ForecastState {
  selectedSkuId: number | null
  selectedModel: 'prophet' | 'arima' | 'xgboost' | 'ensemble'
  timeRange: '3M' | '6M' | '1Y' | '2Y'
  setSelectedSkuId: (id: number | null) => void
  setSelectedModel: (model: ForecastState['selectedModel']) => void
  setTimeRange: (range: ForecastState['timeRange']) => void
}

export const useForecastStore = create<ForecastState>()((set) => ({
  selectedSkuId: null,
  selectedModel: 'ensemble',
  timeRange: '1Y',
  setSelectedSkuId: (id) => set({ selectedSkuId: id }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setTimeRange: (range) => set({ timeRange: range }),
}))
