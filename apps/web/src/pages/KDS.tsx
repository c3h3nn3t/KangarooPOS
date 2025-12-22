import { useState, useEffect } from 'react'
import { clsx } from 'clsx'

type TicketStatus = 'new' | 'in_progress' | 'ready'

interface KitchenTicket {
  id: string
  orderNumber: string
  status: TicketStatus
  items: { name: string; quantity: number; modifiers?: string[] }[]
  createdAt: Date
  priority: 'normal' | 'rush'
}

// Mock tickets for demo
const initialTickets: KitchenTicket[] = [
  {
    id: '1',
    orderNumber: 'ORD-001',
    status: 'new',
    items: [
      { name: 'Latte', quantity: 2, modifiers: ['Yulaf Sutu'] },
      { name: 'Cappuccino', quantity: 1 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 2),
    priority: 'normal',
  },
  {
    id: '2',
    orderNumber: 'ORD-002',
    status: 'new',
    items: [
      { name: 'Americano', quantity: 1 },
      { name: 'Croissant', quantity: 2 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
    priority: 'rush',
  },
  {
    id: '3',
    orderNumber: 'ORD-003',
    status: 'in_progress',
    items: [
      { name: 'Mocha', quantity: 1, modifiers: ['Ekstra Shot'] },
      { name: 'Cheesecake', quantity: 1 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 8),
    priority: 'normal',
  },
  {
    id: '4',
    orderNumber: 'ORD-004',
    status: 'ready',
    items: [
      { name: 'Espresso', quantity: 2 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 12),
    priority: 'normal',
  },
]

const statusConfig: Record<TicketStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: 'Yeni', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  in_progress: { label: 'Hazirlaniyor', color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  ready: { label: 'Hazir', color: 'text-green-700', bgColor: 'bg-green-50' },
}

function TicketTimer({ createdAt }: { createdAt: Date }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - createdAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [createdAt])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  const isWarning = minutes >= 5
  const isDanger = minutes >= 10

  return (
    <span
      className={clsx(
        'font-mono text-lg font-bold',
        isDanger ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-gray-600'
      )}
    >
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
    </span>
  )
}

function TicketCard({
  ticket,
  onBump,
}: {
  ticket: KitchenTicket
  onBump: () => void
}) {
  const config = statusConfig[ticket.status]

  return (
    <div
      className={clsx(
        'rounded-xl border-2 overflow-hidden transition-all',
        ticket.priority === 'rush' ? 'border-red-500' : 'border-gray-200',
        config.bgColor
      )}
    >
      {/* Header */}
      <div className={clsx('px-4 py-3 flex items-center justify-between', config.bgColor)}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">{ticket.orderNumber}</span>
          {ticket.priority === 'rush' && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded">
              ACIL
            </span>
          )}
        </div>
        <TicketTimer createdAt={ticket.createdAt} />
      </div>

      {/* Items */}
      <div className="p-4 bg-white">
        <div className="space-y-3">
          {ticket.items.map((item, index) => (
            <div key={index} className="flex items-start gap-3">
              <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-700">
                {item.quantity}
              </span>
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                {item.modifiers && item.modifiers.length > 0 && (
                  <p className="text-sm text-gray-500">
                    {item.modifiers.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action */}
      <div className="p-3 bg-gray-50 border-t">
        <button
          onClick={onBump}
          className={clsx(
            'w-full py-3 rounded-lg font-semibold transition-colors',
            ticket.status === 'new'
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : ticket.status === 'in_progress'
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-300 text-gray-600'
          )}
        >
          {ticket.status === 'new'
            ? 'Basla'
            : ticket.status === 'in_progress'
            ? 'Hazir'
            : 'Tamamlandi'}
        </button>
      </div>
    </div>
  )
}

export function KDS() {
  const [tickets, setTickets] = useState(initialTickets)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const bumpTicket = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket
        if (ticket.status === 'new') return { ...ticket, status: 'in_progress' as const }
        if (ticket.status === 'in_progress') return { ...ticket, status: 'ready' as const }
        return ticket
      })
    )
  }

  const recallTicket = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket
        if (ticket.status === 'ready') return { ...ticket, status: 'in_progress' as const }
        return ticket
      })
    )
  }

  const dismissTicket = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId))
  }

  const newTickets = tickets.filter((t) => t.status === 'new')
  const inProgressTickets = tickets.filter((t) => t.status === 'in_progress')
  const readyTickets = tickets.filter((t) => t.status === 'ready')

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Mutfak Ekrani</h1>
          <span className="text-sm text-gray-500">
            {tickets.length} aktif siparis
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2',
              soundEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            )}
          >
            {soundEnabled ? '🔊' : '🔇'}
            <span className="text-sm">{soundEnabled ? 'Ses Acik' : 'Ses Kapali'}</span>
          </button>
          <div className="text-2xl font-mono font-bold">
            {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* New */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h2 className="font-semibold text-gray-700">Yeni</h2>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {newTickets.length}
            </span>
          </div>
          <div className="flex-1 overflow-auto space-y-4">
            {newTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onBump={() => bumpTicket(ticket.id)}
              />
            ))}
            {newTickets.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                Yeni siparis yok
              </div>
            )}
          </div>
        </div>

        {/* In Progress */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <h2 className="font-semibold text-gray-700">Hazirlaniyor</h2>
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
              {inProgressTickets.length}
            </span>
          </div>
          <div className="flex-1 overflow-auto space-y-4">
            {inProgressTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onBump={() => bumpTicket(ticket.id)}
              />
            ))}
            {inProgressTickets.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                Hazirlanan siparis yok
              </div>
            )}
          </div>
        </div>

        {/* Ready */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <h2 className="font-semibold text-gray-700">Hazir</h2>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              {readyTickets.length}
            </span>
          </div>
          <div className="flex-1 overflow-auto space-y-4">
            {readyTickets.map((ticket) => (
              <div key={ticket.id} className="relative">
                <TicketCard
                  ticket={ticket}
                  onBump={() => dismissTicket(ticket.id)}
                />
                <button
                  onClick={() => recallTicket(ticket.id)}
                  className="absolute top-2 right-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  Geri Al
                </button>
              </div>
            ))}
            {readyTickets.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                Hazir siparis yok
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <div className="bg-white border-t px-6 py-3 flex items-center justify-between text-sm">
        <div className="flex gap-6">
          <span className="text-gray-500">
            Ort. Hazirlama: <strong className="text-gray-700">4:32</strong>
          </span>
          <span className="text-gray-500">
            Bugun: <strong className="text-gray-700">47 siparis</strong>
          </span>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-gray-100 rounded text-gray-600 hover:bg-gray-200">
            Tumunu Temizle
          </button>
        </div>
      </div>
    </div>
  )
}
