import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { POS } from './pages/POS'
import { Orders } from './pages/Orders'
import { KDS } from './pages/KDS'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/pos" replace />} />
        <Route path="pos" element={<POS />} />
        <Route path="orders" element={<Orders />} />
        <Route path="kds" element={<KDS />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App
