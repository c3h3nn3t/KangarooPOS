import { clsx } from 'clsx'

const categories = [
  { id: null, name: 'Tumu', icon: '🏷️' },
  { id: 'coffee', name: 'Kahve', icon: '☕' },
  { id: 'pastry', name: 'Pasta', icon: '🥐' },
  { id: 'food', name: 'Yiyecek', icon: '🥪' },
]

interface CategoryTabsProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function CategoryTabs({ selected, onSelect }: CategoryTabsProps) {
  return (
    <div className="bg-white border-b px-4 py-2">
      <div className="flex gap-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.id ?? 'all'}
            onClick={() => onSelect(cat.id)}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors',
              selected === cat.id
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <span>{cat.icon}</span>
            <span>{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
