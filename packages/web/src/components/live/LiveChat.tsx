'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveChat, ChatMessage, ChatSettings } from '@/hooks/useLiveChat';
import { formatDistanceToNowStrict } from 'date-fns';
import toast from 'react-hot-toast';

interface LiveChatProps {
  streamId: string;
  token: string | null;
}

export function LiveChat({ streamId, token }: LiveChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  const {
    messages,
    viewerCount,
    pinnedMessage,
    settings,
    isConnected,
    isModerator,
    isHost,
    sendMessage,
    deleteMessage,
    banUser,
    pinMessage,
    updateSettings,
  } = useLiveChat({
    streamId,
    token,
    onError: (message) => toast.error(message),
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;
      sendMessage(input.trim());
      setInput('');
    },
    [input, sendMessage]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      deleteMessage(messageId);
    },
    [deleteMessage]
  );

  const handleBanUser = useCallback(
    (userDid: string, handle: string) => {
      if (confirm(`Ban ${handle} from chat?`)) {
        banUser(userDid, undefined, 'Violation of chat rules');
        toast.success(`${handle} has been banned from chat`);
      }
    },
    [banUser]
  );

  const handlePinMessage = useCallback(
    (message: ChatMessage) => {
      pinMessage(message);
    },
    [pinMessage]
  );

  const handleUnpin = useCallback(() => {
    pinMessage(null);
  }, [pinMessage]);

  const handleToggleSlowMode = useCallback(() => {
    if (settings) {
      updateSettings({
        slowMode: !settings.slowMode,
        slowModeInterval: settings.slowModeInterval || 5,
      });
    }
  }, [settings, updateSettings]);

  if (!token) {
    return (
      <div className="flex flex-col h-full bg-surface rounded-lg overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <p>Log in to view chat</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-text-primary">Live Chat</h3>
          <span className="text-xs text-text-muted">
            {isConnected ? (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {viewerCount} watching
              </span>
            ) : (
              <span className="text-yellow-500">Connecting...</span>
            )}
          </span>
        </div>
        {(isModerator || isHost) && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-text-muted hover:text-text-primary"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Settings panel */}
      {showSettings && settings && (
        <div className="px-4 py-2 bg-surface-hover border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">Slow Mode</span>
            <button
              onClick={handleToggleSlowMode}
              className={`w-10 h-6 rounded-full transition-colors ${
                settings.slowMode ? 'bg-accent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.slowMode ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {settings.slowMode && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Interval:</span>
              <select
                value={settings.slowModeInterval}
                onChange={(e) =>
                  updateSettings({ slowModeInterval: parseInt(e.target.value) })
                }
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary"
              >
                <option value="3">3 seconds</option>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Pinned message */}
      {pinnedMessage && (
        <div className="px-4 py-2 bg-accent/10 border-b border-accent/30 flex items-start gap-2">
          <PinIcon className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm text-accent">
              {pinnedMessage.sender.displayName || pinnedMessage.sender.handle}
            </span>
            <p className="text-sm text-text-primary truncate">{pinnedMessage.text}</p>
          </div>
          {(isModerator || isHost) && (
            <button
              onClick={handleUnpin}
              className="text-text-muted hover:text-text-primary"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-text-muted py-4">
            No messages yet. Be the first to say something!
          </p>
        ) : (
          messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              isModerator={isModerator || isHost}
              onDelete={() => handleDeleteMessage(message.id)}
              onBan={() => handleBanUser(message.sender.did, message.sender.handle)}
              onPin={() => handlePinMessage(message)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              settings?.slowMode
                ? `Slow mode (${settings.slowModeInterval}s)`
                : 'Send a message...'
            }
            maxLength={500}
            className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={!isConnected}
          />
          <button
            type="submit"
            disabled={!input.trim() || !isConnected}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

interface ChatMessageItemProps {
  message: ChatMessage;
  isModerator: boolean;
  onDelete: () => void;
  onBan: () => void;
  onPin: () => void;
}

function ChatMessageItem({
  message,
  isModerator,
  onDelete,
  onBan,
  onPin,
}: ChatMessageItemProps) {
  const [showActions, setShowActions] = useState(false);

  if (message.messageType === 'system') {
    return (
      <div className="text-center text-xs text-text-muted py-1">
        {message.text}
      </div>
    );
  }

  return (
    <div
      className="group flex gap-2 hover:bg-surface-hover rounded px-1 -mx-1"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {message.sender.avatar ? (
        <img
          src={message.sender.avatar}
          alt=""
          className="w-8 h-8 rounded-full flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-text-inverse text-xs font-medium flex-shrink-0">
          {(message.sender.handle || 'U')[0].toUpperCase()}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-medium text-sm ${
              message.sender.isHost
                ? 'text-accent'
                : message.sender.isModerator
                ? 'text-green-500'
                : 'text-text-primary'
            }`}
          >
            {message.sender.displayName || message.sender.handle}
            {message.sender.isHost && (
              <span className="ml-1 text-[10px] px-1 py-0.5 bg-accent text-text-inverse rounded">
                HOST
              </span>
            )}
            {message.sender.isModerator && !message.sender.isHost && (
              <span className="ml-1 text-[10px] px-1 py-0.5 bg-green-500 text-white rounded">
                MOD
              </span>
            )}
          </span>
          <span className="text-[10px] text-text-muted">
            {formatDistanceToNowStrict(new Date(message.createdAt), { addSuffix: false })}
          </span>
        </div>
        <p className="text-sm text-text-primary break-words">{message.text}</p>
      </div>

      {/* Actions (moderator only) */}
      {isModerator && showActions && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onPin}
            className="p-1 text-text-muted hover:text-accent transition-colors"
            title="Pin message"
          >
            <PinIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-text-muted hover:text-red-500 transition-colors"
            title="Delete message"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onBan}
            className="p-1 text-text-muted hover:text-red-500 transition-colors"
            title="Ban user"
          >
            <BanIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// Icons
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function BanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  );
}

export default LiveChat;
