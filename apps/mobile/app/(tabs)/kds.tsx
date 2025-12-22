import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';

interface KitchenTicket {
  id: string;
  orderNumber: string;
  status: 'new' | 'in_progress' | 'ready';
  items: { name: string; quantity: number; modifiers?: string[] }[];
  createdAt: Date;
  priority: 'normal' | 'rush';
}

const initialTickets: KitchenTicket[] = [
  {
    id: '1',
    orderNumber: 'ORD-001',
    status: 'new',
    items: [
      { name: 'Latte', quantity: 2, modifiers: ['Yulaf Sutu'] },
      { name: 'Cappuccino', quantity: 1 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 2),
    priority: 'normal',
  },
  {
    id: '2',
    orderNumber: 'ORD-002',
    status: 'new',
    items: [
      { name: 'Americano', quantity: 1 },
      { name: 'Croissant', quantity: 2 },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
    priority: 'rush',
  },
  {
    id: '3',
    orderNumber: 'ORD-003',
    status: 'in_progress',
    items: [
      { name: 'Mocha', quantity: 1, modifiers: ['Ekstra Shot'] },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 8),
    priority: 'normal',
  },
];

function TicketTimer({ createdAt }: { createdAt: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - createdAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const isWarning = minutes >= 5;
  const isDanger = minutes >= 10;

  return (
    <Text
      className={`font-mono text-lg font-bold ${
        isDanger
          ? 'text-red-600'
          : isWarning
          ? 'text-yellow-600'
          : 'text-gray-600'
      }`}
    >
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
    </Text>
  );
}

function TicketCard({
  ticket,
  onBump,
}: {
  ticket: KitchenTicket;
  onBump: () => void;
}) {
  const statusColors = {
    new: { bg: 'bg-blue-50', border: 'border-blue-200' },
    in_progress: { bg: 'bg-yellow-50', border: 'border-yellow-200' },
    ready: { bg: 'bg-green-50', border: 'border-green-200' },
  };

  const buttonColors = {
    new: 'bg-blue-500',
    in_progress: 'bg-green-500',
    ready: 'bg-gray-300',
  };

  const buttonLabels = {
    new: 'Basla',
    in_progress: 'Hazir',
    ready: 'Tamamlandi',
  };

  return (
    <View
      className={`rounded-xl overflow-hidden mb-3 border-2 ${
        ticket.priority === 'rush'
          ? 'border-red-500'
          : statusColors[ticket.status].border
      } ${statusColors[ticket.status].bg}`}
    >
      {/* Header */}
      <View className="p-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="font-bold text-lg mr-2">{ticket.orderNumber}</Text>
          {ticket.priority === 'rush' && (
            <View className="bg-red-500 px-2 py-0.5 rounded">
              <Text className="text-white text-xs font-bold">ACIL</Text>
            </View>
          )}
        </View>
        <TicketTimer createdAt={ticket.createdAt} />
      </View>

      {/* Items */}
      <View className="px-3 pb-3 bg-white">
        {ticket.items.map((item, index) => (
          <View key={index} className="flex-row items-start py-2 border-b border-gray-100 last:border-0">
            <View className="w-8 h-8 bg-gray-100 rounded-full justify-center items-center mr-3">
              <Text className="font-bold text-gray-700">{item.quantity}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-medium">{item.name}</Text>
              {item.modifiers && (
                <Text className="text-gray-500 text-sm">
                  {item.modifiers.join(', ')}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Action */}
      <TouchableOpacity
        onPress={onBump}
        className={`py-3 ${buttonColors[ticket.status]}`}
      >
        <Text className="text-white text-center font-semibold">
          {buttonLabels[ticket.status]}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function KDSScreen() {
  const [tickets, setTickets] = useState(initialTickets);

  const bumpTicket = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        if (ticket.status === 'new') return { ...ticket, status: 'in_progress' as const };
        if (ticket.status === 'in_progress') return { ...ticket, status: 'ready' as const };
        return ticket;
      })
    );
  };

  const dismissTicket = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  const newTickets = tickets.filter((t) => t.status === 'new');
  const inProgressTickets = tickets.filter((t) => t.status === 'in_progress');
  const readyTickets = tickets.filter((t) => t.status === 'ready');

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 flex-row p-4 gap-4">
        {/* New */}
        <View className="flex-1">
          <View className="flex-row items-center mb-3">
            <View className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
            <Text className="font-semibold text-gray-700">Yeni</Text>
            <View className="ml-2 px-2 py-0.5 bg-blue-100 rounded-full">
              <Text className="text-xs font-medium text-blue-700">
                {newTickets.length}
              </Text>
            </View>
          </View>
          <ScrollView className="flex-1">
            {newTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onBump={() => bumpTicket(ticket.id)}
              />
            ))}
            {newTickets.length === 0 && (
              <Text className="text-center text-gray-400 py-8">
                Yeni siparis yok
              </Text>
            )}
          </ScrollView>
        </View>

        {/* In Progress */}
        <View className="flex-1">
          <View className="flex-row items-center mb-3">
            <View className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
            <Text className="font-semibold text-gray-700">Hazirlaniyor</Text>
            <View className="ml-2 px-2 py-0.5 bg-yellow-100 rounded-full">
              <Text className="text-xs font-medium text-yellow-700">
                {inProgressTickets.length}
              </Text>
            </View>
          </View>
          <ScrollView className="flex-1">
            {inProgressTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onBump={() => bumpTicket(ticket.id)}
              />
            ))}
            {inProgressTickets.length === 0 && (
              <Text className="text-center text-gray-400 py-8">
                Hazirlanan siparis yok
              </Text>
            )}
          </ScrollView>
        </View>

        {/* Ready */}
        <View className="flex-1">
          <View className="flex-row items-center mb-3">
            <View className="w-3 h-3 rounded-full bg-green-500 mr-2" />
            <Text className="font-semibold text-gray-700">Hazir</Text>
            <View className="ml-2 px-2 py-0.5 bg-green-100 rounded-full">
              <Text className="text-xs font-medium text-green-700">
                {readyTickets.length}
              </Text>
            </View>
          </View>
          <ScrollView className="flex-1">
            {readyTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onBump={() => dismissTicket(ticket.id)}
              />
            ))}
            {readyTickets.length === 0 && (
              <Text className="text-center text-gray-400 py-8">
                Hazir siparis yok
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
