'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, LiveStreamSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';
import { Avatar } from '@/components/Avatar';

const CATEGORIES = [
  'All',
  'Gaming',
  'Music',
  'Sports',
  'Talk Shows',
  'Creative',
  'Education',
  'Other',
];

export default function LiveBrowsePage() {
  const { user } = useAuth();
  const [liveStreams, setLiveStreams] = useState<LiveStreamSummary[]>([]);
  const [scheduledStreams, setScheduledStreams] = useState<LiveStreamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadStreams();
  }, [selectedCategory]);

  const loadStreams = async () => {
    try {
      setLoading(true);
      const category = selectedCategory === 'All' ? undefined : selectedCategory;

      const [liveResponse, scheduledResponse] = await Promise.all([
        api.getLiveNow({ category, limit: 20 }),
        api.getScheduledStreams(10),
      ]);

      setLiveStreams(liveResponse.streams);
      setCursor(liveResponse.cursor);
      setHasMore(!!liveResponse.cursor);
      setScheduledStreams(scheduledResponse.streams);
    } catch (err) {
      console.error('Failed to load streams:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!cursor) return;

    try {
      const category = selectedCategory === 'All' ? undefined : selectedCategory;
      const response = await api.getLiveNow({ category, cursor, limit: 20 });
      setLiveStreams([...liveStreams, ...response.streams]);
      setCursor(response.cursor);
      setHasMore(!!response.cursor);
    } catch (err) {
      console.error('Failed to load more streams:', err);
    }
  };

  const formatViewerCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Live</h1>
            <p className="text-gray-400 mt-1">Watch live streams from creators</p>
          </div>
          {user && (
            <Link
              href="/live/studio"
              className="px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium transition-colors"
            >
              Go Live
            </Link>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500" />
          </div>
        ) : (
          <>
            {/* Live Now Section */}
            <section className="mb-12">
              <h2 className="text-xl font-bold text-white mb-4">
                Live Now
                {liveStreams.length > 0 && (
                  <span className="ml-2 text-pink-400 text-sm font-normal">
                    {liveStreams.length} streams
                  </span>
                )}
              </h2>

              {liveStreams.length === 0 ? (
                <div className="bg-gray-900 rounded-xl p-12 text-center">
                  <p className="text-gray-400">No one is live right now</p>
                  {user && (
                    <Link
                      href="/live/studio"
                      className="mt-4 inline-block text-pink-400 hover:text-pink-300"
                    >
                      Be the first to go live
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {liveStreams.map((stream) => (
                    <Link
                      key={stream.id}
                      href={`/live/${stream.id}`}
                      className="group"
                    >
                      <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden mb-3">
                        {stream.thumbnailUrl ? (
                          <img
                            src={stream.thumbnailUrl}
                            alt={stream.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-pink-600/20 to-purple-600/20 flex items-center justify-center">
                            <span className="text-4xl">LIVE</span>
                          </div>
                        )}

                        {/* Live Badge */}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-red-600 text-white text-xs font-medium rounded">
                          LIVE
                        </div>

                        {/* Viewer Count */}
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                          {formatViewerCount(stream.viewerCount)} viewers
                        </div>

                        {/* Category */}
                        {stream.category && (
                          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                            {stream.category}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3">
                        <Avatar
                          src={stream.streamer.avatar}
                          alt={stream.streamer.handle}
                          size={36}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium truncate group-hover:text-pink-400 transition-colors">
                            {stream.title}
                          </h3>
                          <p className="text-gray-400 text-sm truncate">
                            {stream.streamer.displayName || stream.streamer.handle}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={loadMore}
                    className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
            </section>

            {/* Scheduled Streams Section */}
            {scheduledStreams.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4">Upcoming Streams</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {scheduledStreams.map((stream) => (
                    <Link
                      key={stream.id}
                      href={`/live/${stream.id}`}
                      className="group"
                    >
                      <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden mb-3">
                        {stream.thumbnailUrl ? (
                          <img
                            src={stream.thumbnailUrl}
                            alt={stream.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-75"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center">
                            <span className="text-4xl">SOON</span>
                          </div>
                        )}

                        {/* Scheduled Badge */}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                          SCHEDULED
                        </div>

                        {/* Time */}
                        {stream.scheduledAt && (
                          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                            {new Date(stream.scheduledAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3">
                        <Avatar
                          src={stream.streamer.avatar}
                          alt={stream.streamer.handle}
                          size={36}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium truncate group-hover:text-pink-400 transition-colors">
                            {stream.title}
                          </h3>
                          <p className="text-gray-400 text-sm truncate">
                            {stream.streamer.displayName || stream.streamer.handle}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
