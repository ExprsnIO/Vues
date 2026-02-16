import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!handle.trim()) return;

    setError('');
    setIsLoading(true);

    try {
      await signIn(handle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-2">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>

        <View className="flex-1 px-6 justify-center">
          {/* Logo */}
          <View className="items-center mb-8">
            <View className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl items-center justify-center mb-4">
              <Text className="text-white font-bold text-3xl">E</Text>
            </View>
            <Text className="text-white text-2xl font-bold">
              Sign in to Exprsn
            </Text>
            <Text className="text-zinc-500 mt-2 text-center">
              Use your AT Protocol account
            </Text>
          </View>

          {/* Form */}
          <View className="gap-4">
            <View>
              <Text className="text-zinc-400 text-sm mb-2">Your handle</Text>
              <TextInput
                value={handle}
                onChangeText={setHandle}
                placeholder="you.bsky.social"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 text-white text-base"
                editable={!isLoading}
              />
              <Text className="text-zinc-600 text-xs mt-2">
                Enter your handle from Bluesky or any AT Protocol PDS
              </Text>
            </View>

            {error ? (
              <View className="bg-red-900/50 border border-red-700 rounded-lg p-3">
                <Text className="text-red-200 text-sm">{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={isLoading || !handle.trim()}
              className={`py-4 rounded-xl items-center ${
                isLoading || !handle.trim()
                  ? 'bg-primary-800'
                  : 'bg-primary-500'
              }`}
            >
              {isLoading ? (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <Text className="text-white font-semibold text-base">
                    Redirecting...
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-semibold text-base">
                  Continue
                </Text>
              )}
            </Pressable>
          </View>

          {/* Info */}
          <View className="mt-8 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <Text className="text-white font-medium mb-2">
              What is AT Protocol?
            </Text>
            <Text className="text-zinc-400 text-sm">
              AT Protocol is a decentralized social network protocol. Your
              account is portable - you own your identity and can move between
              services freely.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
