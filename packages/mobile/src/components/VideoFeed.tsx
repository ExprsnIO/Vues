import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LegendList } from '@legendapp/list';
import Video from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import { api, type VideoView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VideoFeedProps {
  feedType: string;
}

export function VideoFeed({ feedType }: VideoFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const viewTrackedRef = useRef(new Set<string>());

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['feed', feedType],
      queryFn: ({ pageParam }) => api.getFeed(feedType, pageParam),
      getNextPageParam: (lastPage) => lastPage.cursor,
      initialPageParam: undefined as string | undefined,
    });

  const videos = data?.pages.flatMap((page) => page.feed) ?? [];

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems[0]?.index !== null) {
        const newIndex = viewableItems[0].index;
        setCurrentIndex(newIndex);

        // Track view
        const video = videos[newIndex];
        if (video && !viewTrackedRef.current.has(video.uri)) {
          viewTrackedRef.current.add(video.uri);
          api.trackView(video.uri).catch(() => {});
        }
      }
    },
    [videos]
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#f83b85" />
      </View>
    );
  }

  if (videos.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Ionicons name="videocam-off-outline" size={48} color="#71717a" />
        <Text className="text-zinc-500 mt-4">No videos yet</Text>
      </View>
    );
  }

  return (
    <LegendList
      data={videos}
      keyExtractor={(item) => item.uri}
      estimatedItemSize={SCREEN_HEIGHT}
      pagingEnabled
      snapToInterval={SCREEN_HEIGHT}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      renderItem={({ item, index }) => (
        <VideoItem video={item} isActive={index === currentIndex} />
      )}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="h-20 items-center justify-center">
            <ActivityIndicator color="#f83b85" />
          </View>
        ) : null
      }
    />
  );
}

interface VideoItemProps {
  video: VideoView;
  isActive: boolean;
}

function VideoItem({ video, isActive }: VideoItemProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const videoRef = useRef<Video>(null);
  const [isPaused, setIsPaused] = useState(!isActive);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(video.viewer?.liked ?? false);
  const [likeCount, setLikeCount] = useState(video.likeCount);

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (isLiked && video.viewer?.likeUri) {
        await api.unlike(video.viewer.likeUri);
        return { liked: false };
      } else {
        await api.like(video.uri, video.cid);
        return { liked: true };
      }
    },
    onMutate: () => {
      setIsLiked(!isLiked);
      setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
    },
    onError: () => {
      setIsLiked(isLiked);
      setLikeCount(video.likeCount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const handleLike = useCallback(() => {
    if (!user) return;
    likeMutation.mutate();
  }, [user, likeMutation]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: video.caption || 'Check out this video on Exprsn!',
        url: `https://exprsn.io/video/${encodeURIComponent(video.uri)}`,
      });
    } catch {
      // User cancelled
    }
  }, [video]);

  const src = video.hlsPlaylist || video.cdnUrl || '';

  return (
    <View style={{ height: SCREEN_HEIGHT }} className="bg-black">
      <Pressable
        className="flex-1"
        onPress={() => setIsPaused(!isPaused)}
      >
        {src ? (
          <Video
            ref={videoRef}
            source={{ uri: src }}
            style={{ flex: 1 }}
            resizeMode="contain"
            repeat
            paused={!isActive || isPaused}
            muted={isMuted}
            ignoreSilentSwitch="ignore"
            playInBackground={false}
            playWhenInactive={false}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-zinc-500">Video unavailable</Text>
          </View>
        )}

        {/* Pause indicator */}
        {isPaused && isActive && (
          <View className="absolute inset-0 items-center justify-center">
            <View className="bg-black/50 rounded-full p-4">
              <Ionicons name="play" size={32} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>

      {/* Video overlay */}
      <View className="absolute bottom-0 left-0 right-20 p-4 pb-24">
        <Text className="text-white font-semibold mb-1">
          @{video.author.handle}
        </Text>
        {video.caption && (
          <Text className="text-white text-sm" numberOfLines={2}>
            {video.caption}
          </Text>
        )}
        {video.tags && video.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1">
            {video.tags.slice(0, 3).map((tag) => (
              <Text key={tag} className="text-white/80 text-sm">
                #{tag}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Actions sidebar */}
      <View className="absolute right-3 bottom-32 items-center gap-5">
        {/* Author */}
        <Pressable className="items-center">
          <View className="w-12 h-12 bg-zinc-800 rounded-full items-center justify-center border-2 border-white">
            <Text className="text-white font-bold">
              {video.author.handle[0]?.toUpperCase()}
            </Text>
          </View>
          <View className="absolute -bottom-1 bg-primary-500 rounded-full w-5 h-5 items-center justify-center">
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        </Pressable>

        {/* Like */}
        <Pressable
          onPress={handleLike}
          className="items-center"
          disabled={likeMutation.isPending}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={32}
            color={isLiked ? '#f83b85' : '#fff'}
          />
          <Text className="text-white text-xs mt-1">
            {formatCount(likeCount)}
          </Text>
        </Pressable>

        {/* Comment */}
        <Pressable className="items-center">
          <Ionicons name="chatbubble-ellipses-outline" size={30} color="#fff" />
          <Text className="text-white text-xs mt-1">
            {formatCount(video.commentCount)}
          </Text>
        </Pressable>

        {/* Share */}
        <Pressable onPress={handleShare} className="items-center">
          <Ionicons name="share-social-outline" size={30} color="#fff" />
          <Text className="text-white text-xs mt-1">
            {formatCount(video.shareCount)}
          </Text>
        </Pressable>

        {/* Sound/Music */}
        <Pressable className="w-10 h-10 bg-zinc-800 rounded-full items-center justify-center border border-zinc-600">
          <Ionicons name="musical-notes" size={18} color="#fff" />
        </Pressable>
      </View>

      {/* Mute button */}
      <Pressable
        onPress={() => setIsMuted(!isMuted)}
        className="absolute top-20 right-4 p-2 bg-black/50 rounded-full"
      >
        <Ionicons
          name={isMuted ? 'volume-mute' : 'volume-high'}
          size={20}
          color="#fff"
        />
      </Pressable>
    </View>
  );
}

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return String(count);
}
