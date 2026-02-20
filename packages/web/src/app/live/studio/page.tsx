'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, LiveStreamView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';

const CATEGORIES = [
  'Gaming',
  'Music',
  'Sports',
  'Talk Shows',
  'Creative',
  'Education',
  'Other',
];

export default function LiveStudioPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [activeStream, setActiveStream] = useState<LiveStreamView | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [creating, setCreating] = useState(false);

  // Stream key visibility
  const [showStreamKey, setShowStreamKey] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadActiveStream();
    }
  }, [user, authLoading]);

  const loadActiveStream = async () => {
    try {
      setLoading(true);
      const response = await api.getUserStreams(user!.did, { status: 'live' });
      if (response.streams.length > 0) {
        // Load full stream details
        const streamResponse = await api.getStream(response.streams[0].id);
        setActiveStream(streamResponse.stream);
      }
    } catch (err) {
      console.error('Failed to load active stream:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStream = async () => {
    if (!title.trim()) {
      alert('Please enter a stream title');
      return;
    }

    try {
      setCreating(true);
      const response = await api.createStream({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        visibility,
      });
      setActiveStream(response.stream);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create stream');
    } finally {
      setCreating(false);
    }
  };

  const handleStartStream = async () => {
    if (!activeStream) return;

    try {
      const response = await api.startStream(activeStream.id);
      setActiveStream(response.stream);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start stream');
    }
  };

  const handleEndStream = async () => {
    if (!activeStream) return;
    if (!confirm('Are you sure you want to end the stream?')) return;

    try {
      await api.endStream(activeStream.id);
      setActiveStream(null);
      router.push('/live');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to end stream');
    }
  };

  const handleDeleteStream = async () => {
    if (!activeStream) return;
    if (!confirm('Are you sure you want to delete this stream setup?')) return;

    try {
      await api.deleteStream(activeStream.id);
      setActiveStream(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete stream');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard`);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500" />
        </main>
      </div>
    );
  }

  if (!user) {
    return null; // Router will redirect
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/live"
            className="text-gray-400 hover:text-white text-sm mb-2 inline-block"
          >
            &larr; Back to Live
          </Link>
          <h1 className="text-3xl font-bold text-white">Go Live Studio</h1>
          <p className="text-gray-400 mt-1">Set up and manage your live stream</p>
        </div>

        {activeStream ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Stream Info */}
            <div className="bg-gray-900 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-medium text-white">Stream Details</h2>
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    activeStream.status === 'live'
                      ? 'bg-red-900/50 text-red-400'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {activeStream.status === 'live' ? 'LIVE' : 'Ready'}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Title</label>
                  <p className="text-white">{activeStream.title}</p>
                </div>

                {activeStream.description && (
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Description</label>
                    <p className="text-white">{activeStream.description}</p>
                  </div>
                )}

                {activeStream.category && (
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Category</label>
                    <p className="text-white">{activeStream.category}</p>
                  </div>
                )}

                <div>
                  <label className="block text-gray-400 text-sm mb-1">Visibility</label>
                  <p className="text-white capitalize">{activeStream.visibility}</p>
                </div>

                {activeStream.status === 'live' && (
                  <div className="flex gap-4 pt-4 border-t border-gray-800">
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Viewers</label>
                      <p className="text-2xl font-bold text-white">
                        {activeStream.viewerCount}
                      </p>
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Peak</label>
                      <p className="text-2xl font-bold text-white">
                        {activeStream.peakViewers}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                {activeStream.status === 'live' ? (
                  <button
                    onClick={handleEndStream}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    End Stream
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleStartStream}
                      className="flex-1 px-4 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Go Live
                    </button>
                    <button
                      onClick={handleDeleteStream}
                      className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stream Setup */}
            <div className="bg-gray-900 rounded-xl p-6">
              <h2 className="text-xl font-medium text-white mb-6">Streaming Software Setup</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Server URL</label>
                  <div className="flex">
                    <input
                      type="text"
                      value={activeStream.ingestUrl}
                      readOnly
                      className="flex-1 bg-gray-800 text-white rounded-l-lg px-4 py-2 outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(activeStream.ingestUrl, 'Server URL')}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-r-lg transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Stream Key</label>
                  <div className="flex">
                    <input
                      type={showStreamKey ? 'text' : 'password'}
                      value={activeStream.streamKey}
                      readOnly
                      className="flex-1 bg-gray-800 text-white rounded-l-lg px-4 py-2 outline-none"
                    />
                    <button
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                    >
                      {showStreamKey ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(activeStream.streamKey, 'Stream Key')}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-r-lg transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-yellow-400 text-xs mt-2">
                    Never share your stream key with anyone!
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                <h3 className="text-white font-medium mb-2">How to stream</h3>
                <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                  <li>Open your streaming software (OBS, Streamlabs, etc.)</li>
                  <li>Go to Settings &gt; Stream</li>
                  <li>Select &quot;Custom&quot; as the service</li>
                  <li>Paste the Server URL and Stream Key</li>
                  <li>Click &quot;Start Streaming&quot; in your software</li>
                  <li>Click &quot;Go Live&quot; above when ready</li>
                </ol>
              </div>
            </div>

            {/* Preview Link */}
            {activeStream.status === 'live' && (
              <div className="lg:col-span-2">
                <Link
                  href={`/live/${activeStream.id}`}
                  target="_blank"
                  className="flex items-center justify-center gap-2 p-4 bg-gray-900 rounded-xl text-pink-400 hover:text-pink-300 transition-colors"
                >
                  View your live stream
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        ) : (
          /* Create Stream Form */
          <div className="max-w-2xl">
            <div className="bg-gray-900 rounded-xl p-6">
              <h2 className="text-xl font-medium text-white mb-6">Create New Stream</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What are you streaming today?"
                    maxLength={100}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell viewers what to expect..."
                    rows={3}
                    maxLength={500}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">Select a category</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Tags</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="gaming, esports, valorant (comma separated)"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Visibility</label>
                  <div className="flex gap-3">
                    {(['public', 'followers', 'private'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setVisibility(v)}
                        className={`flex-1 px-4 py-2 rounded-lg capitalize transition-colors ${
                          visibility === v
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateStream}
                disabled={creating || !title.trim()}
                className="w-full mt-6 px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {creating ? 'Creating...' : 'Create Stream'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
