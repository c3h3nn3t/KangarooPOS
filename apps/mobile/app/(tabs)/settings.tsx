import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, Switch } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

interface SettingItem {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  type: 'link' | 'toggle' | 'info';
  value?: boolean;
}

const settingSections = [
  {
    title: 'Magaza',
    items: [
      { id: 'store', icon: '🏪', title: 'Magaza Bilgileri', type: 'link' as const },
      { id: 'currency', icon: '💰', title: 'Para Birimi', subtitle: 'TRY - Turk Lirasi', type: 'link' as const },
      { id: 'language', icon: '🌍', title: 'Dil', subtitle: 'Turkce', type: 'link' as const },
    ],
  },
  {
    title: 'Odeme',
    items: [
      { id: 'cash', icon: '💵', title: 'Nakit Odeme', type: 'toggle' as const, value: true },
      { id: 'card', icon: '💳', title: 'Kart Odeme', type: 'toggle' as const, value: true },
      { id: 'eftpos', icon: '🖥️', title: 'EFT-POS', type: 'toggle' as const, value: false },
    ],
  },
  {
    title: 'Cihazlar',
    items: [
      { id: 'printer', icon: '🖨️', title: 'Yazici', subtitle: 'Epson TM-T88', type: 'link' as const },
      { id: 'scanner', icon: '📷', title: 'Barkod Okuyucu', subtitle: 'Dahili Kamera', type: 'link' as const },
    ],
  },
  {
    title: 'Uygulama',
    items: [
      { id: 'sync', icon: '🔄', title: 'Senkronizasyon', subtitle: 'Son: 5 dakika once', type: 'link' as const },
      { id: 'offline', icon: '📴', title: 'Cevrimdisi Mod', type: 'toggle' as const, value: false },
      { id: 'version', icon: 'ℹ️', title: 'Surum', subtitle: '1.0.0', type: 'info' as const },
    ],
  },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Record<string, boolean>>({
    cash: true,
    card: true,
    eftpos: false,
    offline: false,
  });

  const handleToggle = (id: string) => {
    setSettings((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLogout = () => {
    // TODO: Clear auth state
    router.replace('/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <ScrollView className="flex-1 p-4">
        {settingSections.map((section) => (
          <View key={section.title} className="mb-6">
            <Text className="text-sm font-medium text-gray-500 mb-2 px-2">
              {section.title}
            </Text>
            <View className="bg-white rounded-xl overflow-hidden">
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  disabled={item.type !== 'link'}
                  className={`flex-row items-center p-4 ${
                    index < section.items.length - 1
                      ? 'border-b border-gray-100'
                      : ''
                  }`}
                >
                  <Text className="text-2xl mr-4">{item.icon}</Text>
                  <View className="flex-1">
                    <Text className="font-medium">{item.title}</Text>
                    {item.subtitle && (
                      <Text className="text-gray-500 text-sm">
                        {item.subtitle}
                      </Text>
                    )}
                  </View>
                  {item.type === 'toggle' && (
                    <Switch
                      value={settings[item.id]}
                      onValueChange={() => handleToggle(item.id)}
                      trackColor={{ false: '#e5e7eb', true: '#0ea5e9' }}
                      thumbColor="#ffffff"
                    />
                  )}
                  {item.type === 'link' && (
                    <Text className="text-gray-400 text-xl">›</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          className="bg-white rounded-xl p-4 mb-8"
        >
          <View className="flex-row items-center justify-center">
            <Text className="text-red-600 font-medium">Cikis Yap</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
