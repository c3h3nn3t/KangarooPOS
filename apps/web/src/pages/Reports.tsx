import { useState } from 'react'
import { clsx } from 'clsx'

type DateRange = 'today' | 'week' | 'month' | 'custom'

interface SalesData {
  label: string
  sales: number
  orders: number
}

// Mock data for demo
const todaySales: SalesData[] = [
  { label: '09:00', sales: 15000, orders: 3 },
  { label: '10:00', sales: 28500, orders: 6 },
  { label: '11:00', sales: 42000, orders: 9 },
  { label: '12:00', sales: 65000, orders: 15 },
  { label: '13:00', sales: 52000, orders: 12 },
  { label: '14:00', sales: 38000, orders: 8 },
  { label: '15:00', sales: 29500, orders: 6 },
]

const topProducts = [
  { name: 'Latte', quantity: 45, revenue: 247500 },
  { name: 'Americano', quantity: 38, revenue: 171000 },
  { name: 'Cappuccino', quantity: 32, revenue: 160000 },
  { name: 'Croissant', quantity: 28, revenue: 98000 },
  { name: 'Mocha', quantity: 22, revenue: 132000 },
]

const paymentBreakdown = [
  { method: 'Kart', amount: 485000, percentage: 62 },
  { method: 'Nakit', amount: 295000, percentage: 38 },
]

export function Reports() {
  const [dateRange, setDateRange] = useState<DateRange>('today')

  const totalSales = todaySales.reduce((sum, d) => sum + d.sales, 0)
  const totalOrders = todaySales.reduce((sum, d) => sum + d.orders, 0)
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0
  const maxSales = Math.max(...todaySales.map((d) => d.sales))

  return (
    <div className="h-full overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Raporlar</h1>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                dateRange === range
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200 hover:bg-gray-50'
              )}
            >
              {range === 'today' ? 'Bugun' : range === 'week' ? 'Bu Hafta' : 'Bu Ay'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500">Toplam Satis</p>
          <p className="text-2xl font-bold text-primary-600">
            {(totalSales / 100).toLocaleString('tr-TR')} TL
          </p>
          <p className="text-sm text-green-600 mt-1">+12% onceki gune gore</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500">Siparis Sayisi</p>
          <p className="text-2xl font-bold">{totalOrders}</p>
          <p className="text-sm text-green-600 mt-1">+8% onceki gune gore</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500">Ortalama Siparis</p>
          <p className="text-2xl font-bold">
            {(avgOrderValue / 100).toLocaleString('tr-TR')} TL
          </p>
          <p className="text-sm text-gray-500 mt-1">Siparis basina</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500">Aktif Vardiya</p>
          <p className="text-2xl font-bold">08:00 - 16:00</p>
          <p className="text-sm text-gray-500 mt-1">Ahmet Y.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Sales chart */}
        <div className="col-span-2 bg-white rounded-xl p-4 border">
          <h3 className="font-semibold mb-4">Saatlik Satis</h3>
          <div className="h-64 flex items-end gap-2">
            {todaySales.map((data) => (
              <div key={data.label} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-primary-500 rounded-t transition-all hover:bg-primary-600"
                  style={{ height: `${(data.sales / maxSales) * 100}%` }}
                />
                <span className="text-xs text-gray-500 mt-2">{data.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="bg-white rounded-xl p-4 border">
          <h3 className="font-semibold mb-4">Odeme Yontemleri</h3>
          <div className="space-y-4">
            {paymentBreakdown.map((payment) => (
              <div key={payment.method}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{payment.method}</span>
                  <span className="font-medium">
                    {(payment.amount / 100).toLocaleString('tr-TR')} TL
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${payment.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">%{payment.percentage}</p>
              </div>
            ))}
          </div>

          {/* Pie chart placeholder */}
          <div className="mt-6 flex justify-center">
            <div className="w-32 h-32 rounded-full border-8 border-primary-500 relative">
              <div
                className="absolute inset-0 rounded-full border-8 border-primary-200"
                style={{
                  clipPath: `polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 50% 0%)`,
                  transform: 'rotate(137deg)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Top products */}
        <div className="col-span-2 bg-white rounded-xl p-4 border">
          <h3 className="font-semibold mb-4">En Cok Satan Urunler</h3>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-2">Urun</th>
                <th className="pb-2 text-right">Adet</th>
                <th className="pb-2 text-right">Gelir</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product, index) => (
                <tr key={product.name} className="border-b last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </span>
                      <span>{product.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right">{product.quantity}</td>
                  <td className="py-3 text-right font-medium">
                    {(product.revenue / 100).toLocaleString('tr-TR')} TL
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-xl p-4 border">
          <h3 className="font-semibold mb-4">Hizli Istatistikler</h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Iptal Edilen</span>
              <span className="font-medium">3 siparis</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Iade</span>
              <span className="font-medium">1 siparis</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Indirimler</span>
              <span className="font-medium">2.500 TL</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">KDV</span>
              <span className="font-medium">
                {((totalSales * 0.2) / 100).toLocaleString('tr-TR')} TL
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Net Gelir</span>
              <span className="font-semibold text-green-600">
                {((totalSales * 0.8) / 100).toLocaleString('tr-TR')} TL
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Export buttons */}
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-outline">
          📊 Excel Indir
        </button>
        <button className="btn btn-outline">
          📄 PDF Indir
        </button>
        <button className="btn btn-primary">
          🖨️ Yazdir
        </button>
      </div>
    </div>
  )
}
