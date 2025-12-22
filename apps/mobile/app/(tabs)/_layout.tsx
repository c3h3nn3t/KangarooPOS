import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    pos: '💳',
    orders: '📋',
    kds: '🍳',
    settings: '⚙️',
  };

  return (
    <View className="items-center">
      <Text className="text-2xl">{icons[name] || '📱'}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          height: 80,
          paddingTop: 8,
          paddingBottom: 24,
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
        },
        headerStyle: {
          backgroundColor: '#0284c7',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
          headerTitle: 'Satis',
          tabBarIcon: ({ focused }) => <TabIcon name="pos" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Siparisler',
          tabBarIcon: ({ focused }) => <TabIcon name="orders" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          title: 'Mutfak',
          tabBarIcon: ({ focused }) => <TabIcon name="kds" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ayarlar',
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
