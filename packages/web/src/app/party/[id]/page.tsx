'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWatchParty } from '@/hooks/useWatchParty';
import toast from 'react-hot-toast';

export default function WatchPartyRoom() {
  const params = useParams();
  const router = useRouter();
  const partyId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [userDid, setUserDid] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Get auth token
  useEffect(() => {
    const storedToken = localStorage.getItem('session_token');
    const storedDid = localStorage.getItem('user_did');
    if (storedToken) setToken(storedToken);
    if (storedDid) setUserDid(storedDid);
  }, []);

  // Watch party WebSocket hook
  const {
    party,
    participants,
    queue,
    messages,
    playbackState,
    isConnected,
    isJoined,
    play,
    pause,
    seek,
    nextVideo,
    sendMessage,
    addToQueue,
    syncPosition,
    startPositionSync,
    stopPositionSync,
    updateLocalPosition,
  } = useWatchParty({
    partyId,
    token: token || '',
    onPlaybackUpdate: (state) => {
      if (videoRef.current) {
        // Sync video element
        if (state.videoUri && state.videoUri !== party?.currentVideoUri) {
          // Video changed - would need to load new video
        }
        if (Math.abs(videoRef.current.currentTime - (state.position || 0)) > 2) {
          videoRef.current.currentTime = state.position || 0;
        }
        if (state.isPlaying && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        } else if (!state.isPlaying && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      }
    },
    onNewMessage: () => {
      // Scroll to bottom of chat
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  // Check if current user is host or cohost
  const currentParticipant = participants.find((p) => p.userDid === userDid);
  const canControl = currentParticipant?.role === 'host' || currentParticipant?.role === 'cohost';
  const isHost = currentParticipant?.role === 'host';

  // Leave party mutation
  const leaveMutation = useMutation({
    mutationFn: () => api.leaveWatchParty(partyId),
    onSuccess: () => {
      router.push('/');
    },
  });

  // End party mutation
  const endMutation = useMutation({
    mutationFn: () => api.endWatchParty(partyId),
    onSuccess: () => {
      toast.success('Party ended');
      router.push('/');
    },
    onError: () => {
      toast.error('Failed to end party');
    },
  });

  // Handle video time update for sync
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && canControl) {
      updateLocalPosition(videoRef.current.currentTime);
    }
  }, [canControl, updateLocalPosition]);

  // Handle video play/pause
  const handlePlay = () => {
    if (canControl && videoRef.current) {
      play(videoRef.current.currentTime);
      startPositionSync();
    }
  };

  const handlePause = () => {
    if (canControl && videoRef.current) {
      pause(videoRef.current.currentTime);
      stopPositionSync();
    }
  };

  const handleSeek = () => {
    if (canControl && videoRef.current) {
      seek(videoRef.current.currentTime);
    }
  };

  // Handle send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    sendMessage(messageInput.trim());
    setMessageInput('');
  };

  // Copy invite link
  const copyInviteLink = () => {
    if (party) {
      const url = `${window.location.origin}/party/join/${party.inviteCode}`;
      navigator.clipboard.writeText(url);
      toast.success('Invite link copied!');
    }
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Please sign in to join the party</h1>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-accent text-text-inverse rounded-xl hover:bg-accent-hover transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-muted">
            {isConnected ? 'Joining party...' : 'Connecting...'}
          </p>
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Party not found</h1>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-accent text-text-inverse rounded-xl hover:bg-accent-hover transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const presentParticipants = participants.filter((p) => p.isPresent);

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
          <div className="flex items-center gap-4">
            <button
              onClick={() => leaveMutation.mutate()}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-semibold text-text-primary">{party.name}</h1>
              <p className="text-sm text-text-muted">
                {presentParticipants.length} watching
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover rounded-lg text-sm text-text-primary hover:bg-border transition-colors"
            >
              <ShareIcon className="w-4 h-4" />
              Invite
            </button>
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showQueue ? 'bg-accent text-text-inverse' : 'bg-surface-hover text-text-primary hover:bg-border'
              }`}
            >
              <QueueIcon className="w-4 h-4" />
              Queue ({queue.length})
            </button>
            {isHost && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to end the party?')) {
                    endMutation.mutate();
                  }
                }}
                className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
              >
                End Party
              </button>
            )}
          </div>
        </div>

        {/* Video Player */}
        <div className="flex-1 bg-black flex items-center justify-center relative">
          {playbackState?.videoUri ? (
            <video
              ref={videoRef}
              className="max-w-full max-h-full"
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeek}
              controls={canControl}
              playsInline
            >
              <source src={playbackState.videoUri} type="video/mp4" />
            </video>
          ) : (
            <div className="text-center text-white">
              <VideoIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No video playing</p>
              {canControl && (
                <p className="text-sm opacity-75 mt-2">Add videos to the queue to get started</p>
              )}
            </div>
          )}

          {/* Sync indicator */}
          {!canControl && playbackState?.isPlaying && (
            <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 rounded text-white text-xs flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Synced
            </div>
          )}

          {/* Participant avatars */}
          <div className="absolute bottom-4 left-4 flex -space-x-2">
            {presentParticipants.slice(0, 5).map((p) => (
              <div
                key={p.userDid}
                className="w-8 h-8 rounded-full border-2 border-black overflow-hidden"
                title={p.user?.displayName || p.user?.handle}
              >
                {p.user?.avatar ? (
                  <img src={p.user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-accent flex items-center justify-center text-text-inverse text-xs font-medium">
                    {(p.user?.handle || 'U')[0].toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            {presentParticipants.length > 5 && (
              <div className="w-8 h-8 rounded-full border-2 border-black bg-surface-hover flex items-center justify-center text-text-primary text-xs font-medium">
                +{presentParticipants.length - 5}
              </div>
            )}
          </div>
        </div>

        {/* Playback Controls (for non-hosts, show status) */}
        {!canControl && (
          <div className="px-4 py-2 bg-surface border-t border-border text-center text-sm text-text-muted">
            {playbackState?.isPlaying ? 'Playing' : 'Paused'} - Host controls playback
          </div>
        )}
      </div>

      {/* Sidebar - Queue or Chat */}
      <div className="w-80 border-l border-border flex flex-col bg-surface">
        {showQueue ? (
          <>
            {/* Queue Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Queue</h2>
              <button
                onClick={() => setShowQueue(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {queue.length === 0 ? (
                <p className="text-center text-text-muted py-8">Queue is empty</p>
              ) : (
                queue.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 p-2 rounded-lg ${
                      item.videoUri === playbackState?.videoUri
                        ? 'bg-accent/10 border border-accent/30'
                        : 'bg-surface-hover'
                    }`}
                  >
                    <div className="text-text-muted font-medium w-6 text-center">
                      {index + 1}
                    </div>
                    {item.video?.thumbnail ? (
                      <img
                        src={item.video.thumbnail}
                        alt=""
                        className="w-16 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-16 h-10 rounded bg-surface flex items-center justify-center">
                        <VideoIcon className="w-4 h-4 text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">
                        {item.video?.caption || 'Video'}
                      </p>
                      <p className="text-xs text-text-muted">
                        {item.video?.author?.displayName || item.video?.author?.handle}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Next button for host */}
            {canControl && queue.length > 1 && (
              <div className="p-4 border-t border-border">
                <button
                  onClick={nextVideo}
                  className="w-full px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Next Video
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-text-primary">Chat</h2>
            </div>

            {/* Chat Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              {messages.length === 0 ? (
                <p className="text-center text-text-muted py-8">
                  No messages yet. Say hello!
                </p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="flex gap-2">
                    {msg.sender?.avatar ? (
                      <img
                        src={msg.sender.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-text-inverse text-xs font-medium">
                        {(msg.sender?.handle || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-text-primary text-sm">
                          {msg.sender?.displayName || msg.sender?.handle}
                        </span>
                        <span className="text-xs text-text-muted">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-text-primary text-sm">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            {party.chatEnabled && (
              <form onSubmit={handleSendMessage} className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="submit"
                    disabled={!messageInput.trim()}
                    className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    <SendIcon className="w-5 h-5" />
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}
