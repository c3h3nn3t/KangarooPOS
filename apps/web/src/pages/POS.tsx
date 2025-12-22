import { useState } from 'react'
import { ProductGrid } from '../components/pos/ProductGrid'
import { Cart } from '../components/pos/Cart'
import { CategoryTabs } from '../components/pos/CategoryTabs'
import { SearchBar } from '../components/pos/SearchBar'
import { PaymentModal } from '../components/payment/PaymentModal'
import { useCartStore } from '../stores/cartStore'

export function POS() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const { items, total } = useCartStore()

  const handleCheckout = () => {
    if (items.length > 0) {
      setShowPayment(true)
    }
  }

  const handlePaymentComplete = () => {
    setShowPayment(false)
    // Clear cart and create order
    useCartStore.getState().clearCart()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">Yeni Siparis</h1>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Magaza: Ana Magaza</span>
          <span className="text-sm text-gray-500">|</span>
          <span className="text-sm text-gray-500">Kasiyer: Admin</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Product area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <CategoryTabs
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
          <div className="flex-1 overflow-auto p-4">
            <ProductGrid
              searchQuery={searchQuery}
              categoryId={selectedCategory}
            />
          </div>
        </div>

        {/* Cart area */}
        <div className="w-96 border-l bg-white flex flex-col">
          <Cart />
          <div className="p-4 border-t">
            <button
              onClick={handleCheckout}
              disabled={items.length === 0}
              className="btn btn-primary w-full btn-lg"
            >
              Odeme ({(total / 100).toFixed(2)} TL)
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          total={total}
          onComplete={handlePaymentComplete}
          onCancel={() => setShowPayment(false)}
        />
      )}
    </div>
  )
}
