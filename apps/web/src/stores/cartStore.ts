import { create } from 'zustand'

export interface CartItem {
  id: string
  productId: string
  name: string
  price: number // in cents
  quantity: number
  modifiers?: Array<{ id: string; name: string; price: number }>
  notes?: string
}

interface CartStore {
  items: CartItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  customerId: string | null
  orderNote: string

  addItem: (item: Omit<CartItem, 'id' | 'quantity'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateItemNote: (id: string, note: string) => void
  setCustomer: (customerId: string | null) => void
  setOrderNote: (note: string) => void
  applyDiscount: (amount: number) => void
  clearCart: () => void
  recalculateTotals: () => void
}

const TAX_RATE = 0.20 // 20% KDV
// Fiyatlar KDV dahil olarak saklanıyor
// KDV hesaplama: kdvDahilFiyat / 1.20 = kdvHaricFiyat, kdvDahilFiyat - kdvHaricFiyat = kdvTutari

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  subtotal: 0,
  tax: 0,
  discount: 0,
  total: 0,
  customerId: null,
  orderNote: '',

  addItem: (item) => {
    set((state) => {
      // Check if item already exists
      const existingIndex = state.items.findIndex(
        (i) => i.productId === item.productId &&
              JSON.stringify(i.modifiers) === JSON.stringify(item.modifiers)
      )

      let newItems: CartItem[]
      if (existingIndex >= 0) {
        // Increase quantity
        newItems = state.items.map((i, idx) =>
          idx === existingIndex ? { ...i, quantity: i.quantity + 1 } : i
        )
      } else {
        // Add new item
        newItems = [
          ...state.items,
          { ...item, id: crypto.randomUUID(), quantity: 1 },
        ]
      }

      return { items: newItems }
    })
    get().recalculateTotals()
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    }))
    get().recalculateTotals()
  },

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id)
      return
    }

    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, quantity } : i
      ),
    }))
    get().recalculateTotals()
  },

  updateItemNote: (id, note) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, notes: note } : i
      ),
    }))
  },

  setCustomer: (customerId) => {
    set({ customerId })
  },

  setOrderNote: (note) => {
    set({ orderNote: note })
  },

  applyDiscount: (amount) => {
    set({ discount: amount })
    get().recalculateTotals()
  },

  clearCart: () => {
    set({
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      customerId: null,
      orderNote: '',
    })
  },

  recalculateTotals: () => {
    const state = get()
    // Fiyatlar KDV dahil - toplam hesapla
    const grossTotal = state.items.reduce((sum, item) => {
      const itemTotal = item.price * item.quantity
      const modifiersTotal = (item.modifiers || []).reduce(
        (m, mod) => m + mod.price * item.quantity,
        0
      )
      return sum + itemTotal + modifiersTotal
    }, 0)

    // İndirim uygula
    const total = Math.max(0, grossTotal - state.discount)

    // KDV'yi toplam fiyattan çıkar (fiyatlar KDV dahil olduğu için)
    // KDV dahil fiyat = KDV hariç fiyat * 1.20
    // KDV hariç fiyat = KDV dahil fiyat / 1.20
    // KDV tutarı = KDV dahil fiyat - KDV hariç fiyat
    const subtotal = Math.round(total / (1 + TAX_RATE))
    const tax = total - subtotal

    set({ subtotal, tax, total })
  },
}))
