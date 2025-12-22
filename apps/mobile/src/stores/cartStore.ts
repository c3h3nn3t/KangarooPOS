import { create } from 'zustand';

interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number; // in cents
  quantity: number;
  modifiers?: { id: string; name: string; price: number }[];
}

interface CartStore {
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  addItem: (item: Omit<CartItem, 'id' | 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
}

const TAX_RATE = 0.20; // 20% KDV
// Fiyatlar KDV dahil olarak saklanıyor
// KDV hesaplama: kdvDahilFiyat / 1.20 = kdvHaricFiyat

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  subtotal: 0,
  tax: 0,
  discount: 0,
  total: 0,

  addItem: (item) => {
    const items = get().items;
    const existingItem = items.find((i) => i.productId === item.productId);

    if (existingItem) {
      set({
        items: items.map((i) =>
          i.id === existingItem.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      set({
        items: [
          ...items,
          { ...item, id: `${item.productId}-${Date.now()}`, quantity: 1 },
        ],
      });
    }

    recalculateTotals(get, set);
  },

  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) });
    recalculateTotals(get, set);
  },

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id);
      return;
    }

    set({
      items: get().items.map((i) => (i.id === id ? { ...i, quantity } : i)),
    });
    recalculateTotals(get, set);
  },

  clearCart: () => {
    set({ items: [], subtotal: 0, tax: 0, discount: 0, total: 0 });
  },
}));

function recalculateTotals(
  get: () => CartStore,
  set: (state: Partial<CartStore>) => void
) {
  const items = get().items;
  const discount = get().discount;

  // Fiyatlar KDV dahil - toplam hesapla
  const grossTotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // İndirim uygula
  const total = Math.max(0, grossTotal - discount);

  // KDV'yi toplam fiyattan çıkar (fiyatlar KDV dahil olduğu için)
  const subtotal = Math.round(total / (1 + TAX_RATE));
  const tax = total - subtotal;

  set({ subtotal, tax, total });
}
