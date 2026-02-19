'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function CreateListPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState<'curatelist' | 'modlist'>('curatelist');

  const createMutation = useMutation({
    mutationFn: () =>
      api.createList({
        name: name.trim(),
        description: description.trim() || undefined,
        purpose,
      }),
    onSuccess: (data) => {
      router.push(`/lists/${encodeURIComponent(data.uri)}`);
    },
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Create List</h1>
            <button
              onClick={() => router.back()}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Give your list a name"
                maxLength={64}
                required
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
              <p className="text-text-muted text-xs mt-1 text-right">
                {name.length}/64
              </p>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this list about?"
                maxLength={256}
                rows={3}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
              />
              <p className="text-text-muted text-xs mt-1 text-right">
                {description.length}/256
              </p>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                List Type
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface cursor-pointer">
                  <input
                    type="radio"
                    name="purpose"
                    value="curatelist"
                    checked={purpose === 'curatelist'}
                    onChange={() => setPurpose('curatelist')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-text-primary">User List</p>
                    <p className="text-sm text-text-muted">
                      A list of accounts you want to organize together
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-surface cursor-pointer">
                  <input
                    type="radio"
                    name="purpose"
                    value="modlist"
                    checked={purpose === 'modlist'}
                    onChange={() => setPurpose('modlist')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-text-primary">Mute List</p>
                    <p className="text-sm text-text-muted">
                      A list of accounts to mute in your feed
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error */}
            {createMutation.isError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Failed to create list'}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="w-full py-3 bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-text-inverse font-medium rounded-lg transition-colors"
            >
              {createMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create List'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
