import { View, Text, SafeAreaView, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center px-6">
        <View className="w-24 h-24 bg-zinc-800 rounded-full items-center justify-center mb-4">
          <Ionicons name="person-outline" size={48} color="#71717a" />
        </View>
        <Text className="text-white text-xl font-semibold mb-2">
          Sign in to view profile
        </Text>
        <Text className="text-zinc-500 text-center mb-6">
          Create an account or sign in to see your profile
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
      <ScrollView className="flex-1">
        {/* Header with settings */}
        <View className="flex-row justify-end px-4 py-2">
          <Pressable className="p-2">
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Profile info */}
        <View className="items-center px-4 pb-6">
          <View className="w-24 h-24 bg-zinc-800 rounded-full items-center justify-center mb-3">
            <Text className="text-white text-3xl font-bold">
              {user.handle[0]?.toUpperCase()}
            </Text>
          </View>
          <Text className="text-white text-lg font-semibold">
            @{user.handle}
          </Text>

          {/* Stats */}
          <View className="flex-row gap-8 mt-6">
            <View className="items-center">
              <Text className="text-white text-lg font-bold">0</Text>
              <Text className="text-zinc-500 text-sm">Following</Text>
            </View>
            <View className="items-center">
              <Text className="text-white text-lg font-bold">0</Text>
              <Text className="text-zinc-500 text-sm">Followers</Text>
            </View>
            <View className="items-center">
              <Text className="text-white text-lg font-bold">0</Text>
              <Text className="text-zinc-500 text-sm">Likes</Text>
            </View>
          </View>

          {/* Edit profile button */}
          <Pressable className="mt-6 px-6 py-2 border border-zinc-700 rounded-lg">
            <Text className="text-white font-medium">Edit profile</Text>
          </Pressable>
        </View>

        {/* Videos tabs */}
        <View className="flex-row border-b border-zinc-800">
          <Pressable className="flex-1 py-3 items-center border-b-2 border-white">
            <Ionicons name="grid-outline" size={22} color="#fff" />
          </Pressable>
          <Pressable className="flex-1 py-3 items-center">
            <Ionicons name="heart-outline" size={22} color="#71717a" />
          </Pressable>
          <Pressable className="flex-1 py-3 items-center">
            <Ionicons name="bookmark-outline" size={22} color="#71717a" />
          </Pressable>
        </View>

        {/* Empty videos */}
        <View className="items-center justify-center py-20">
          <Ionicons name="videocam-outline" size={48} color="#71717a" />
          <Text className="text-zinc-500 mt-4">No videos yet</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/create')}
            className="mt-4 bg-primary-500 px-6 py-2 rounded-lg"
          >
            <Text className="text-white font-medium">Create your first video</Text>
          </Pressable>
        </View>

        {/* Sign out */}
        <View className="px-4 py-8">
          <Pressable
            onPress={signOut}
            className="flex-row items-center justify-center gap-2 py-3"
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text className="text-red-500 font-medium">Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
