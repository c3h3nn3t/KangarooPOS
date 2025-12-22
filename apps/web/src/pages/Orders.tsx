import { useState } from 'react'
import { clsx } from 'clsx'

type OrderStatus = 'all' | 'pending' | 'completed' | 'cancelled' | 'refunded'

interface Order {
  id: string
  orderNumber: string
  status: 'pending' | 'completed' | 'cancelled' | 'refunded'
  total: number
  itemCount: number
  customerName?: string
  createdAt: Date
  paymentMethod: 'cash' | 'card'
}

// Mock orders for demo
const mockOrders: Order[] = [
  {
    id: '1',
    orderNumber: 'ORD-001',
    status: 'completed',
    total: 15500,
    itemCount: 3,
    customerName: 'Ahmet Yilmaz',
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
    paymentMethod: 'card',
  },
  {
    id: '2',
    orderNumber: 'ORD-002',
    status: 'pending',
    total: 8500,
    itemCount: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
    paymentMethod: 'cash',
  },
  {
    id: '3',
    orderNumber: 'ORD-003',
    status: 'completed',
    total: 22000,
    itemCount: 4,
    customerName: 'Ayse Demir',
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
    paymentMethod: 'card',
  },
  {
    id: '4',
    orderNumber: 'ORD-004',
    status: 'refunded',
    total: 5500,
    itemCount: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
    paymentMethod: 'card',
  },
  {
    id: '5',
    orderNumber: 'ORD-005',
    status: 'cancelled',
    total: 12000,
    itemCount: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 90),
    paymentMethod: 'cash',
  },
]

const statusConfig: Record<Order['status'], { label: string; color: string }> = {
  pending: { label: 'Bekliyor', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Tamamlandi', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Iptal', color: 'bg-red-100 text-red-800' },
  refunded: { label: 'Iade', color: 'bg-purple-100 text-purple-800' },
}

export function Orders() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const filteredOrders = mockOrders.filter(
    (order) => statusFilter === 'all' || order.status === statusFilter
  )

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full flex">
      {/* Orders list */}
      <div className="flex-1 flex flex-col">
        {/* Filters */}
        <div className="bg-white border-b px-4 py-3">
          <div className="flex gap-2">
            {(['all', 'pending', 'completed', 'cancelled', 'refunded'] as OrderStatus[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    statusFilter === status
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {status === 'all' ? 'Tumu' : statusConfig[status].label}
                </button>
              )
            )}
          </div>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={clsx(
                  'w-full text-left p-4 rounded-lg border transition-colors',
                  selectedOrder?.id === order.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{order.orderNumber}</span>
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          statusConfig[order.status].color
                        )}
                      >
                        {statusConfig[order.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {order.itemCount} urun {order.customerName && `• ${order.customerName}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{(order.total / 100).toFixed(2)} TL</p>
                    <p className="text-sm text-gray-500">{formatTime(order.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}

            {filteredOrders.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                Bu filtreye uygun siparis bulunamadi
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order detail */}
      <div className="w-96 border-l bg-gray-50 flex flex-col">
        {selectedOrder ? (
          <>
            <div className="p-4 border-b bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{selectedOrder.orderNumber}</h2>
                <span
                  className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    statusConfig[selectedOrder.status].color
                  )}
                >
                  {statusConfig[selectedOrder.status].label}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {selectedOrder.createdAt.toLocaleString('tr-TR')}
              </p>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-4">
                {/* Customer info */}
                {selectedOrder.customerName && (
                  <div className="bg-white p-3 rounded-lg">
                    <p className="text-sm text-gray-500">Musteri</p>
                    <p className="font-medium">{selectedOrder.customerName}</p>
                  </div>
                )}

                {/* Order items placeholder */}
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-500 mb-2">Siparis Detayi</p>
                  <div className="space-y-2">
                    {Array.from({ length: selectedOrder.itemCount }).map((_, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>Urun {i + 1}</span>
                        <span className="text-gray-500">
                          {((selectedOrder.total / selectedOrder.itemCount) / 100).toFixed(2)} TL
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment info */}
                <div className="bg-white p-3 rounded-lg">
                  <p className="text-sm text-gray-500 mb-2">Odeme</p>
                  <div className="flex items-center gap-2">
                    <span>{selectedOrder.paymentMethod === 'cash' ? '💵' : '💳'}</span>
                    <span>{selectedOrder.paymentMethod === 'cash' ? 'Nakit' : 'Kart'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t bg-white">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-500">Toplam</span>
                <span className="text-xl font-bold">
                  {(selectedOrder.total / 100).toFixed(2)} TL
                </span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline flex-1">Fis Yazdir</button>
                {selectedOrder.status === 'completed' && (
                  <button className="btn btn-outline flex-1 text-red-600 border-red-200 hover:bg-red-50">
                    Iade
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-2">📋</div>
              <p>Detay gormek icin siparis secin</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
