'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, LiveStreamView, LiveChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';
import { Avatar } from '@/components/Avatar';

export default function LiveStreamViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const streamId = params.id as string;

  const [stream, setStream] = useState<LiveStreamView | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [sending, setSending] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // UI state
  const [showChat, setShowChat] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Video player ref
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadStream();
  }, [streamId]);

  useEffect(() => {
    // Join stream on mount
    if (stream?.status === 'live') {
      api.joinStream(streamId).catch(console.error);
    }

    // Leave stream on unmount
    return () => {
      api.leaveStream(streamId).catch(console.error);
    };
  }, [streamId, stream?.status]);

  useEffect(() => {
    // Poll for new messages
    const interval = setInterval(() => {
      if (stream?.status === 'live') {
        loadChat();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [streamId, stream?.status]);

  useEffect(() => {
    // Auto-scroll chat
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Initialize HLS player
    if (stream?.playbackUrl && videoRef.current) {
      const video = videoRef.current;

      if (stream.playbackUrl.includes('.m3u8')) {
        // Use HLS.js for HLS streams
        import('hls.js').then(({ default: Hls }) => {
          if (Hls.isSupported()) {
            const hls = new Hls({
              lowLatencyMode: true,
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 6,
            });
            hls.loadSource(stream.playbackUrl!);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              video.play().catch(console.error);
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = stream.playbackUrl!;
            video.play().catch(console.error);
          }
        });
      } else {
        // Direct video URL
        video.src = stream.playbackUrl;
        video.play().catch(console.error);
      }
    }
  }, [stream?.playbackUrl]);

  const loadStream = async () => {
    try {
      setLoading(true);
      const [streamResponse, chatResponse] = await Promise.all([
        api.getStream(streamId),
        api.getStreamChat(streamId, { limit: 100 }),
      ]);
      setStream(streamResponse.stream);
      setMessages(chatResponse.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  const loadChat = async () => {
    try {
      const response = await api.getStreamChat(streamId, { limit: 50 });
      setMessages(response.messages);
    } catch (err) {
      console.error('Failed to load chat:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || sending) return;

    try {
      setSending(true);
      await api.sendStreamChat(streamId, chatMessage);
      setChatMessage('');
      loadChat();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await api.deleteStreamChat(streamId, messageId);
      loadChat();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete message');
    }
  };

  const toggleFullscreen = useCallback(() => {
    const container = document.getElementById('video-container');
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const formatViewerCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500" />
        </main>
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Stream not found'}</p>
            <Link href="/live" className="text-pink-400 hover:text-pink-300">
              Browse streams
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const isOwner = user?.did === stream.streamer.did;
  const isModerator = stream.viewer?.isModerator;
  const canModerate = isOwner || isModerator;

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64">
        <div className="flex h-screen">
          {/* Video Section */}
          <div className={`flex-1 flex flex-col ${showChat ? '' : 'w-full'}`}>
            {/* Video Player */}
            <div id="video-container" className="relative bg-black aspect-video">
              {stream.status === 'live' && stream.playbackUrl ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  muted
                  playsInline
                />
              ) : stream.status === 'ended' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl text-gray-400 mb-2">Stream Ended</p>
                    <p className="text-gray-500">
                      Peak viewers: {formatViewerCount(stream.peakViewers)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl text-gray-400 mb-2">Stream Starting Soon</p>
                    {stream.scheduledAt && (
                      <p className="text-gray-500">
                        Scheduled for{' '}
                        {new Date(stream.scheduledAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Video Controls Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {stream.status === 'live' && (
                      <span className="px-2 py-1 bg-red-600 text-white text-sm font-medium rounded">
                        LIVE
                      </span>
                    )}
                    <span className="text-white text-sm">
                      {formatViewerCount(stream.viewerCount)} watching
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowChat(!showChat)}
                      className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
                    >
                      {showChat ? 'Hide' : 'Show'} Chat
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
                    >
                      {isFullscreen ? 'Exit' : 'Fullscreen'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Stream Info */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  <Link href={`/profile/${stream.streamer.handle}`}>
                    <Avatar
                      src={stream.streamer.avatar}
                      alt={stream.streamer.handle}
                      size={48}
                    />
                  </Link>
                  <div>
                    <h1 className="text-xl font-bold text-white">{stream.title}</h1>
                    <Link
                      href={`/profile/${stream.streamer.handle}`}
                      className="text-gray-400 hover:text-pink-400 transition-colors"
                    >
                      {stream.streamer.displayName || stream.streamer.handle}
                    </Link>
                    {stream.category && (
                      <span className="ml-3 px-2 py-0.5 bg-gray-800 text-gray-300 text-sm rounded">
                        {stream.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* Follow button would go here */}
                </div>
              </div>

              {stream.description && (
                <p className="mt-4 text-gray-300">{stream.description}</p>
              )}

              {stream.tags && stream.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stream.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-800 text-gray-300 text-sm rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chat Section */}
          {showChat && (
            <div className="w-80 flex flex-col border-l border-gray-800">
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-800">
                <h2 className="text-white font-medium">Live Chat</h2>
              </div>

              {/* Chat Messages */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {messages.map((message) => (
                  <div key={message.id} className="group">
                    <div className="flex items-start gap-2">
                      <Avatar
                        src={message.user.avatar}
                        alt={message.user.handle}
                        size={24}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-sm font-medium ${
                              message.isModerator ? 'text-green-400' : 'text-gray-300'
                            }`}
                          >
                            {message.user.displayName || message.user.handle}
                          </span>
                          {message.isModerator && (
                            <span className="text-xs text-green-400">[MOD]</span>
                          )}
                        </div>
                        <p className="text-white text-sm break-words">
                          {message.message}
                        </p>
                      </div>
                      {canModerate && (
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs transition-opacity"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              {user ? (
                stream.viewer?.isBanned ? (
                  <div className="p-4 border-t border-gray-800 text-center">
                    <p className="text-red-400 text-sm">
                      You are banned from this chat
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendMessage}
                    className="p-4 border-t border-gray-800"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        placeholder="Send a message..."
                        maxLength={200}
                        className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                      />
                      <button
                        type="submit"
                        disabled={sending || !chatMessage.trim()}
                        className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-800 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                      >
                        Send
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <div className="p-4 border-t border-gray-800 text-center">
                  <Link
                    href="/login"
                    className="text-pink-400 hover:text-pink-300 text-sm"
                  >
                    Sign in to chat
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
