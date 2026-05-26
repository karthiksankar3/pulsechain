import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<div>Dashboard (coming soon)</div>} />
        <Route path="/forecast" element={<div>Forecast Engine (coming soon)</div>} />
        <Route path="/inventory" element={<div>Inventory Intelligence (coming soon)</div>} />
        <Route path="/pharma-pulse" element={<div>PharmaPulse (coming soon)</div>} />
        <Route path="/scenarios" element={<div>Scenario Planning (coming soon)</div>} />
        <Route path="/sop" element={<div>SOP Console (coming soon)</div>} />
        <Route path="/login" element={<div>Login (coming soon)</div>} />
        <Route path="*" element={<div>404 — Page not found</div>} />
      </Routes>
    </BrowserRouter>
  )
}
