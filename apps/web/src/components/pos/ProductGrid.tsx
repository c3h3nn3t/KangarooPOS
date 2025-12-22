import { useCartStore } from '../../stores/cartStore'

// Mock products for demo
const mockProducts = [
  { id: '1', name: 'Americano', price: 4500, category: 'coffee', image: null },
  { id: '2', name: 'Latte', price: 5500, category: 'coffee', image: null },
  { id: '3', name: 'Cappuccino', price: 5000, category: 'coffee', image: null },
  { id: '4', name: 'Espresso', price: 3500, category: 'coffee', image: null },
  { id: '5', name: 'Mocha', price: 6000, category: 'coffee', image: null },
  { id: '6', name: 'Caramel Macchiato', price: 6500, category: 'coffee', image: null },
  { id: '7', name: 'Croissant', price: 3500, category: 'pastry', image: null },
  { id: '8', name: 'Cikolatali Muffin', price: 4000, category: 'pastry', image: null },
  { id: '9', name: 'Cheesecake', price: 7500, category: 'pastry', image: null },
  { id: '10', name: 'Brownie', price: 4500, category: 'pastry', image: null },
  { id: '11', name: 'Sandvic', price: 5500, category: 'food', image: null },
  { id: '12', name: 'Tost', price: 4500, category: 'food', image: null },
]

interface ProductGridProps {
  searchQuery: string
  categoryId: string | null
}

export function ProductGrid({ searchQuery, categoryId }: ProductGridProps) {
  const addItem = useCartStore((s) => s.addItem)

  const filteredProducts = mockProducts.filter((p) => {
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !categoryId || p.category === categoryId
    return matchesSearch && matchesCategory
  })

  const handleProductClick = (product: typeof mockProducts[0]) => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
    })
  }

  return (
    <div className="pos-product-grid">
      {filteredProducts.map((product) => (
        <button
          key={product.id}
          onClick={() => handleProductClick(product)}
          className="card p-4 hover:shadow-md transition-shadow cursor-pointer text-left"
        >
          <div className="w-full aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-4xl">
            {product.category === 'coffee' ? '☕' : product.category === 'pastry' ? '🥐' : '🥪'}
          </div>
          <h3 className="font-medium text-sm truncate">{product.name}</h3>
          <p className="text-primary-600 font-semibold">
            {(product.price / 100).toFixed(2)} ₺
          </p>
          <p className="text-xs text-gray-400">KDV Dahil</p>
        </button>
      ))}

      {filteredProducts.length === 0 && (
        <div className="col-span-full text-center py-12 text-gray-500">
          Urun bulunamadi
        </div>
      )}
    </div>
  )
}
