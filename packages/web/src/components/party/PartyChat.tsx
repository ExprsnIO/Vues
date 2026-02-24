'use client';

import { useState, useRef, useEffect } from 'react';
import { WatchPartyMessage } from '@/lib/api';

interface PartyChatProps {
  messages: WatchPartyMessage[];
  chatEnabled: boolean;
  onSendMessage: (text: string) => void;
}

export function PartyChat({ messages, chatEnabled, onSendMessage }: PartyChatProps) {
  const [messageInput, setMessageInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    onSendMessage(messageInput.trim());
    setMessageInput('');
  };

  return (
    <div className="flex flex-col h-full">
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
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Chat Input */}
      {chatEnabled ? (
        <form onSubmit={handleSubmit} className="p-4 border-t border-border">
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
      ) : (
        <div className="p-4 border-t border-border text-center text-sm text-text-muted">
          Chat is disabled for this party
        </div>
      )}
    </div>
  );
}

function ChatMessage({ message }: { message: WatchPartyMessage }) {
  const isSystem = message.messageType === 'system';

  if (isSystem) {
    return (
      <div className="text-center text-sm text-text-muted py-1">
        {message.text}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {message.sender?.avatar ? (
        <img
          src={message.sender.avatar}
          alt=""
          className="w-8 h-8 rounded-full"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-text-inverse text-xs font-medium">
          {(message.sender?.handle || 'U')[0].toUpperCase()}
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-text-primary text-sm">
            {message.sender?.displayName || message.sender?.handle}
          </span>
          <span className="text-xs text-text-muted">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="text-text-primary text-sm">{message.text}</p>
      </div>
    </div>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

export default PartyChat;
