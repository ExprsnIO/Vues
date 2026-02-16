import { View, Text, SafeAreaView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';

export default function InboxScreen() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center px-6">
        <Ionicons name="mail-outline" size={64} color="#71717a" />
        <Text className="text-white text-xl font-semibold mt-4 mb-2">
          Sign in to view inbox
        </Text>
        <Text className="text-zinc-500 text-center mb-6">
          You need to sign in to see your notifications and messages
        </Text>
        <Pressable
          onPress={() => router.push('/login')}
          className="bg-primary-500 px-8 py-3 rounded-lg"
        >
          <Text className="text-white font-semibold text-base">Sign in</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="px-4">
        <Text className="text-2xl font-bold text-white mb-4 mt-2">Inbox</Text>

        {/* Activity tabs */}
        <View className="flex-row gap-4 mb-4">
          <Pressable className="bg-white px-4 py-2 rounded-full">
            <Text className="text-black font-medium">All activity</Text>
          </Pressable>
          <Pressable className="bg-zinc-800 px-4 py-2 rounded-full">
            <Text className="text-white font-medium">Likes</Text>
          </Pressable>
          <Pressable className="bg-zinc-800 px-4 py-2 rounded-full">
            <Text className="text-white font-medium">Comments</Text>
          </Pressable>
        </View>

        {/* Empty state */}
        <View className="items-center justify-center py-20">
          <Ionicons name="notifications-off-outline" size={48} color="#71717a" />
          <Text className="text-zinc-500 mt-4">No notifications yet</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
