import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handlePinSubmit = () => {
    if (pin.length !== 4) {
      setError('PIN 4 haneli olmalidir');
      return;
    }

    // TODO: Validate PIN against API
    router.replace('/(tabs)/pos');
  };

  const handlePinPress = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 justify-center items-center px-8">
        {/* Logo */}
        <View className="w-24 h-24 bg-primary-600 rounded-2xl justify-center items-center mb-8">
          <Text className="text-white text-4xl font-bold">K</Text>
        </View>

        <Text className="text-2xl font-bold text-gray-900 mb-2">KangarooPOS</Text>
        <Text className="text-gray-500 mb-8">PIN kodunuzu girin</Text>

        {/* PIN Display */}
        <View className="flex-row gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              className={`w-4 h-4 rounded-full ${
                i < pin.length ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </View>

        {error ? (
          <Text className="text-red-500 mb-4">{error}</Text>
        ) : null}

        {/* Number Pad */}
        <View className="w-full max-w-xs">
          {[[1, 2, 3], [4, 5, 6], [7, 8, 9], ['', 0, '⌫']].map((row, rowIndex) => (
            <View key={rowIndex} className="flex-row justify-center gap-4 mb-4">
              {row.map((digit, colIndex) => (
                <TouchableOpacity
                  key={colIndex}
                  onPress={() => {
                    if (digit === '⌫') {
                      handleBackspace();
                    } else if (digit !== '') {
                      handlePinPress(digit.toString());
                    }
                  }}
                  disabled={digit === ''}
                  className={`w-20 h-20 rounded-full justify-center items-center ${
                    digit === '' ? 'opacity-0' : 'bg-white border border-gray-200'
                  }`}
                >
                  <Text className="text-2xl font-semibold text-gray-800">
                    {digit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handlePinSubmit}
          disabled={pin.length !== 4}
          className={`w-full max-w-xs py-4 rounded-xl mt-4 ${
            pin.length === 4 ? 'bg-primary-600' : 'bg-gray-300'
          }`}
        >
          <Text className="text-white text-center font-semibold text-lg">
            Giris Yap
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
