'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function JoinWatchPartyPage() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = params.code as string;

  const joinMutation = useMutation({
    mutationFn: () => api.joinWatchParty(inviteCode),
    onSuccess: (data) => {
      if (data.joined) {
        router.replace(`/party/${data.party.id}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to join party');
      setTimeout(() => router.push('/'), 2000);
    },
  });

  useEffect(() => {
    // Check if logged in
    const token = localStorage.getItem('session_token');
    if (!token) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/party/join/${inviteCode}`);
      return;
    }

    // Auto-join on mount
    joinMutation.mutate();
  }, [inviteCode]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">Joining Party</h1>
        <p className="text-text-muted">
          {joinMutation.isPending
            ? 'Connecting to party...'
            : joinMutation.isError
            ? 'Failed to join party'
            : 'Redirecting...'}
        </p>
        {joinMutation.isError && (
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
          >
            Go Home
          </button>
        )}
      </div>
    </div>
  );
}
