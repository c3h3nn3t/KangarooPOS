import { useState } from 'react'
import { useCartStore } from '../../stores/cartStore'

export function Cart() {
  const { items, subtotal, tax, discount, total, orderNote, updateQuantity, removeItem, updateItemNote, setOrderNote } = useCartStore()
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [editingItemNote, setEditingItemNote] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2">🛒</div>
          <p>Sepet bos</p>
          <p className="text-sm">Urun eklemek icin tiklayin</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Order Note Toggle */}
      <div className="p-3 border-b">
        {!showNoteInput && !orderNote ? (
          <button
            onClick={() => setShowNoteInput(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors"
          >
            <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-lg hover:bg-primary-100">+</span>
            <span>Siparis notu ekle</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Siparis Notu</span>
              {orderNote && (
                <button
                  onClick={() => { setOrderNote(''); setShowNoteInput(false) }}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Kaldir
                </button>
              )}
            </div>
            <textarea
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Mutfak icin not..."
              className="w-full text-sm p-2 border rounded-lg resize-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              rows={2}
              autoFocus={showNoteInput && !orderNote}
              onBlur={() => !orderNote && setShowNoteInput(false)}
            />
          </div>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate">{item.name}</h4>
                  <p className="text-sm text-gray-500">
                    {(item.price / 100).toFixed(2)} ₺ x {item.quantity}
                  </p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      {item.modifiers.map((m) => m.name).join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-white border flex items-center justify-center hover:bg-gray-100"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-white border flex items-center justify-center hover:bg-gray-100"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 ml-2"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Item note */}
              {editingItemNote === item.id ? (
                <input
                  type="text"
                  value={item.notes || ''}
                  onChange={(e) => updateItemNote(item.id, e.target.value)}
                  placeholder="Urun notu..."
                  className="mt-2 w-full text-xs p-2 border rounded focus:ring-1 focus:ring-primary-500"
                  autoFocus
                  onBlur={() => setEditingItemNote(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingItemNote(null)}
                />
              ) : item.notes ? (
                <button
                  onClick={() => setEditingItemNote(item.id)}
                  className="mt-2 text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded"
                >
                  📝 {item.notes}
                </button>
              ) : (
                <button
                  onClick={() => setEditingItemNote(item.id)}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-600"
                >
                  + Not ekle
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="border-t p-4 space-y-2">
        <div className="flex justify-between text-lg font-semibold">
          <span>Toplam</span>
          <span>{(total / 100).toFixed(2)} ₺</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Indirim</span>
            <span>-{(discount / 100).toFixed(2)} ₺</span>
          </div>
        )}
        <div className="flex justify-between text-xs text-gray-400 pt-2 border-t">
          <span>KDV Dahil (%20)</span>
          <span>{(tax / 100).toFixed(2)} ₺</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>KDV Haric</span>
          <span>{(subtotal / 100).toFixed(2)} ₺</span>
        </div>
      </div>
    </div>
  )
}
