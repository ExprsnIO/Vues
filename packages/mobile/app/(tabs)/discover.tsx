import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TRENDING_TAGS = [
  'fyp',
  'viral',
  'funny',
  'dance',
  'music',
  'comedy',
  'cooking',
  'fitness',
  'travel',
  'fashion',
];

const CATEGORIES = [
  { id: 'comedy', name: 'Comedy', icon: 'happy-outline' as const, color: '#fbbf24' },
  { id: 'dance', name: 'Dance', icon: 'musical-notes-outline' as const, color: '#ec4899' },
  { id: 'music', name: 'Music', icon: 'headset-outline' as const, color: '#22c55e' },
  { id: 'sports', name: 'Sports', icon: 'football-outline' as const, color: '#3b82f6' },
  { id: 'food', name: 'Food', icon: 'restaurant-outline' as const, color: '#ef4444' },
  { id: 'gaming', name: 'Gaming', icon: 'game-controller-outline' as const, color: '#a855f7' },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 px-4">
        <Text className="text-2xl font-bold text-white mb-4 mt-2">Discover</Text>

        {/* Search bar */}
        <View className="flex-row items-center bg-zinc-900 rounded-xl px-4 py-3 mb-6">
          <Ionicons name="search" size={20} color="#71717a" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search videos, users, sounds"
            placeholderTextColor="#71717a"
            className="flex-1 text-white ml-3 text-base"
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Trending hashtags */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-white mb-3">
              Trending Hashtags
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {TRENDING_TAGS.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => router.push(`/tag/${tag}`)}
                  className="bg-zinc-800 px-4 py-2 rounded-full"
                >
                  <Text className="text-white text-sm">#{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Categories */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-white mb-3">
              Categories
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {CATEGORIES.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => router.push(`/category/${category.id}`)}
                  className="w-[48%] bg-zinc-900 rounded-xl p-4 flex-row items-center gap-3"
                >
                  <View
                    style={{ backgroundColor: category.color }}
                    className="w-10 h-10 rounded-full items-center justify-center"
                  >
                    <Ionicons name={category.icon} size={20} color="#fff" />
                  </View>
                  <Text className="text-white font-medium">{category.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
