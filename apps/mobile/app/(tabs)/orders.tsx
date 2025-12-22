import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';

interface Order {
  id: string;
  orderNumber: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  total: number;
  itemCount: number;
  createdAt: Date;
}

const mockOrders: Order[] = [
  {
    id: '1',
    orderNumber: 'ORD-001',
    status: 'completed',
    total: 15500,
    itemCount: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
  },
  {
    id: '2',
    orderNumber: 'ORD-002',
    status: 'pending',
    total: 8500,
    itemCount: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
  },
  {
    id: '3',
    orderNumber: 'ORD-003',
    status: 'completed',
    total: 22000,
    itemCount: 4,
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
  },
];

const statusConfig = {
  pending: { label: 'Bekliyor', color: 'bg-yellow-100', textColor: 'text-yellow-800' },
  completed: { label: 'Tamamlandi', color: 'bg-green-100', textColor: 'text-green-800' },
  cancelled: { label: 'Iptal', color: 'bg-red-100', textColor: 'text-red-800' },
  refunded: { label: 'Iade', color: 'bg-purple-100', textColor: 'text-purple-800' },
};

export default function OrdersScreen() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 flex-row">
        {/* Order List */}
        <ScrollView className="flex-1 p-4">
          {mockOrders.map((order) => (
            <TouchableOpacity
              key={order.id}
              onPress={() => setSelectedOrder(order)}
              className={`bg-white rounded-xl p-4 mb-3 border-2 ${
                selectedOrder?.id === order.id
                  ? 'border-primary-500'
                  : 'border-transparent'
              }`}
            >
              <View className="flex-row items-start justify-between">
                <View>
                  <View className="flex-row items-center">
                    <Text className="font-bold text-lg mr-2">
                      {order.orderNumber}
                    </Text>
                    <View
                      className={`px-2 py-1 rounded-full ${
                        statusConfig[order.status].color
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          statusConfig[order.status].textColor
                        }`}
                      >
                        {statusConfig[order.status].label}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-gray-500 mt-1">
                    {order.itemCount} urun
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="font-bold">
                    {(order.total / 100).toFixed(2)} TL
                  </Text>
                  <Text className="text-gray-500 text-sm">
                    {order.createdAt.toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Order Detail */}
        <View className="w-80 bg-white border-l border-gray-200">
          {selectedOrder ? (
            <>
              <View className="p-4 border-b border-gray-200">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-bold">
                    {selectedOrder.orderNumber}
                  </Text>
                  <View
                    className={`px-2 py-1 rounded-full ${
                      statusConfig[selectedOrder.status].color
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        statusConfig[selectedOrder.status].textColor
                      }`}
                    >
                      {statusConfig[selectedOrder.status].label}
                    </Text>
                  </View>
                </View>
                <Text className="text-gray-500 mt-1">
                  {selectedOrder.createdAt.toLocaleString('tr-TR')}
                </Text>
              </View>

              <ScrollView className="flex-1 p-4">
                <View className="bg-gray-50 p-3 rounded-lg">
                  <Text className="text-sm text-gray-500 mb-2">
                    Siparis Detayi
                  </Text>
                  {Array.from({ length: selectedOrder.itemCount }).map((_, i) => (
                    <View
                      key={i}
                      className="flex-row justify-between py-2 border-b border-gray-200 last:border-0"
                    >
                      <Text>Urun {i + 1}</Text>
                      <Text className="text-gray-500">
                        {(
                          selectedOrder.total /
                          selectedOrder.itemCount /
                          100
                        ).toFixed(2)}{' '}
                        TL
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View className="p-4 border-t border-gray-200">
                <View className="flex-row justify-between mb-4">
                  <Text className="text-gray-500">Toplam</Text>
                  <Text className="text-xl font-bold">
                    {(selectedOrder.total / 100).toFixed(2)} TL
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity className="flex-1 py-3 border border-gray-300 rounded-xl">
                    <Text className="text-center font-medium">Fis Yazdir</Text>
                  </TouchableOpacity>
                  {selectedOrder.status === 'completed' && (
                    <TouchableOpacity className="flex-1 py-3 border border-red-300 rounded-xl">
                      <Text className="text-center font-medium text-red-600">
                        Iade
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View className="flex-1 justify-center items-center p-4">
              <Text className="text-4xl mb-2">📋</Text>
              <Text className="text-gray-500">Detay gormek icin siparis secin</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
