import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { useCartStore } from '../../src/stores/cartStore';

// Mock products
const mockProducts = [
  { id: '1', name: 'Americano', price: 4500, category: 'coffee' },
  { id: '2', name: 'Latte', price: 5500, category: 'coffee' },
  { id: '3', name: 'Cappuccino', price: 5000, category: 'coffee' },
  { id: '4', name: 'Espresso', price: 3500, category: 'coffee' },
  { id: '5', name: 'Mocha', price: 6000, category: 'coffee' },
  { id: '6', name: 'Croissant', price: 3500, category: 'pastry' },
  { id: '7', name: 'Muffin', price: 4000, category: 'pastry' },
  { id: '8', name: 'Cheesecake', price: 7500, category: 'pastry' },
  { id: '9', name: 'Sandvic', price: 5500, category: 'food' },
  { id: '10', name: 'Tost', price: 4500, category: 'food' },
];

const categories = [
  { id: null, name: 'Tumu', icon: '🏷️' },
  { id: 'coffee', name: 'Kahve', icon: '☕' },
  { id: 'pastry', name: 'Pasta', icon: '🥐' },
  { id: 'food', name: 'Yiyecek', icon: '🥪' },
];

export default function POSScreen() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { items, total, addItem, removeItem, updateQuantity, clearCart } = useCartStore();

  const filteredProducts = mockProducts.filter((p) => {
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handlePayment = () => {
    // TODO: Open payment modal
    alert(`Toplam: ${(total / 100).toFixed(2)} TL\nOdeme tamamlandi!`);
    clearCart();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 flex-row">
        {/* Products section */}
        <View className="flex-1">
          {/* Search */}
          <View className="p-4 bg-white border-b border-gray-200">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Urun ara..."
              className="bg-gray-100 px-4 py-3 rounded-lg"
            />
          </View>

          {/* Categories */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="bg-white border-b border-gray-200"
            contentContainerStyle={{ padding: 8 }}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id ?? 'all'}
                onPress={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-lg mr-2 flex-row items-center ${
                  selectedCategory === cat.id
                    ? 'bg-primary-100'
                    : 'bg-gray-100'
                }`}
              >
                <Text className="mr-1">{cat.icon}</Text>
                <Text
                  className={
                    selectedCategory === cat.id
                      ? 'text-primary-700 font-medium'
                      : 'text-gray-600'
                  }
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Product Grid */}
          <FlatList
            data={filteredProducts}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() =>
                  addItem({
                    productId: item.id,
                    name: item.name,
                    price: item.price,
                  })
                }
                className="flex-1 m-1 bg-white rounded-xl p-3 border border-gray-200"
              >
                <View className="aspect-square bg-gray-100 rounded-lg justify-center items-center mb-2">
                  <Text className="text-3xl">
                    {item.category === 'coffee'
                      ? '☕'
                      : item.category === 'pastry'
                      ? '🥐'
                      : '🥪'}
                  </Text>
                </View>
                <Text className="font-medium text-sm" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-primary-600 font-semibold">
                  {(item.price / 100).toFixed(2)} TL
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Cart section */}
        <View className="w-80 bg-white border-l border-gray-200">
          <View className="p-4 border-b border-gray-200">
            <Text className="text-lg font-bold">Sepet</Text>
          </View>

          {items.length === 0 ? (
            <View className="flex-1 justify-center items-center p-4">
              <Text className="text-4xl mb-2">🛒</Text>
              <Text className="text-gray-500">Sepet bos</Text>
            </View>
          ) : (
            <>
              <ScrollView className="flex-1 p-4">
                {items.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg mb-2"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="font-medium">{item.name}</Text>
                      <Text className="text-gray-500 text-sm">
                        {(item.price / 100).toFixed(2)} TL x {item.quantity}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <TouchableOpacity
                        onPress={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        className="w-8 h-8 bg-white border border-gray-200 rounded-full justify-center items-center"
                      >
                        <Text>-</Text>
                      </TouchableOpacity>
                      <Text className="w-8 text-center font-medium">
                        {item.quantity}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        className="w-8 h-8 bg-white border border-gray-200 rounded-full justify-center items-center"
                      >
                        <Text>+</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => removeItem(item.id)}
                        className="w-8 h-8 bg-red-50 rounded-full justify-center items-center ml-2"
                      >
                        <Text className="text-red-500">×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* Totals */}
              <View className="p-4 border-t border-gray-200">
                <View className="flex-row justify-between mb-4">
                  <Text className="text-gray-500">Toplam</Text>
                  <Text className="text-xl font-bold">
                    {(total / 100).toFixed(2)} TL
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handlePayment}
                  className="bg-primary-600 py-4 rounded-xl"
                >
                  <Text className="text-white text-center font-semibold text-lg">
                    Odeme Al
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
