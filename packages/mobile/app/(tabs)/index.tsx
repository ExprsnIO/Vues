import { useState, useCallback } from 'react';
import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { VideoFeed } from '@/components/VideoFeed';

type FeedType = 'following' | 'foryou';

export default function HomeScreen() {
  const [feedType, setFeedType] = useState<FeedType>('foryou');

  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <SafeAreaView className="absolute top-0 left-0 right-0 z-10">
        <View className="flex-row justify-center items-center py-3 gap-6">
          <Pressable onPress={() => setFeedType('following')}>
            <Text
              className={`text-base font-semibold ${
                feedType === 'following' ? 'text-white' : 'text-zinc-500'
              }`}
            >
              Following
            </Text>
          </Pressable>
          <View className="w-px h-4 bg-zinc-700" />
          <Pressable onPress={() => setFeedType('foryou')}>
            <Text
              className={`text-base font-semibold ${
                feedType === 'foryou' ? 'text-white' : 'text-zinc-500'
              }`}
            >
              For You
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Video Feed */}
      <VideoFeed feedType={feedType} />
    </View>
  );
}
