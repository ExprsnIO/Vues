'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function CreateWatchPartyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(20);
  const [chatEnabled, setChatEnabled] = useState(true);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createWatchParty({
        name,
        maxParticipants,
        chatEnabled,
      }),
    onSuccess: (data) => {
      toast.success('Party created!');
      router.push(`/party/${data.party.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create party');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a party name');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Create Watch Party</h1>
        <p className="text-text-muted">Watch videos together with friends in real-time</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Party Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Movie night with friends"
            className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Max Participants ({maxParticipants})
          </label>
          <input
            type="range"
            min="2"
            max="50"
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>2</span>
            <span>50</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="block text-sm font-medium text-text-primary">Enable Chat</span>
            <span className="text-sm text-text-muted">Allow participants to chat during the party</span>
          </div>
          <button
            type="button"
            onClick={() => setChatEnabled(!chatEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              chatEnabled ? 'bg-accent' : 'bg-surface-hover'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                chatEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full px-6 py-3 bg-accent text-text-inverse font-medium rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Party'}
          </button>
        </div>
      </form>

      {/* Features */}
      <div className="mt-12 grid grid-cols-3 gap-4 text-center">
        <div className="p-4">
          <SyncIcon className="w-8 h-8 mx-auto text-accent mb-2" />
          <p className="text-sm text-text-muted">Synced Playback</p>
        </div>
        <div className="p-4">
          <ChatIcon className="w-8 h-8 mx-auto text-accent mb-2" />
          <p className="text-sm text-text-muted">Live Chat</p>
        </div>
        <div className="p-4">
          <QueueIcon className="w-8 h-8 mx-auto text-accent mb-2" />
          <p className="text-sm text-text-muted">Video Queue</p>
        </div>
      </div>
    </div>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
