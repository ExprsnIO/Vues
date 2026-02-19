'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function EditProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Load initial values from user
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setAvatarPreview(user.avatar || null);
    }
  }, [user]);

  // Track changes
  useEffect(() => {
    if (user) {
      const nameChanged = displayName !== (user.displayName || '');
      const bioChanged = bio !== (user.bio || '');
      const avatarChanged = avatarFile !== null;
      setHasChanges(nameChanged || bioChanged || avatarChanged);
    }
  }, [displayName, bio, avatarFile, user]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Upload avatar if changed
      if (avatarFile) {
        setUploadProgress('Getting upload URL...');

        // Get presigned upload URL
        const { uploadUrl, avatarUrl } = await api.getAvatarUploadUrl(avatarFile.type);

        setUploadProgress('Uploading image...');

        // Upload directly to S3
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: avatarFile,
          headers: {
            'Content-Type': avatarFile.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload avatar');
        }

        setUploadProgress('Completing upload...');

        // Complete the upload and update avatar URL
        await api.completeAvatarUpload(avatarUrl);

        setUploadProgress(null);
      }

      // Update profile text fields
      await api.updateActorProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      });
    },
    onSuccess: async () => {
      // Refresh user data in auth context
      await refreshUser();
      // Invalidate profile query
      if (user?.handle) {
        queryClient.invalidateQueries({ queryKey: ['profile', user.handle] });
      }
      router.push(`/profile/${user?.handle}`);
    },
    onError: () => {
      setUploadProgress(null);
    },
  });

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Edit profile</h1>
            <button
              onClick={() => router.back()}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-full bg-surface flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-text-primary">
                    {user?.handle[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  Change photo
                </button>
                <p className="text-text-muted text-sm mt-1">
                  JPG, PNG or GIF. Max 5MB.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>

            {/* Display Name */}
            <div>
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                maxLength={50}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
              <p className="text-text-muted text-xs mt-1 text-right">
                {displayName.length}/50
              </p>
            </div>

            {/* Handle (read-only) */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Username
              </label>
              <div className="w-full px-4 py-3 bg-surface-hover border border-border rounded-lg text-text-muted">
                @{user?.handle}
              </div>
              <p className="text-text-muted text-xs mt-1">
                Usernames cannot be changed
              </p>
            </div>

            {/* Bio */}
            <div>
              <label
                htmlFor="bio"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself"
                maxLength={150}
                rows={3}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
              />
              <p className="text-text-muted text-xs mt-1 text-right">
                {bio.length}/150
              </p>
            </div>

            {/* Error message */}
            {updateMutation.isError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : 'Failed to update profile'}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={!hasChanges || updateMutation.isPending}
              className="w-full py-3 bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-text-inverse font-medium rounded-lg transition-colors"
            >
              {updateMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {uploadProgress || 'Saving...'}
                </span>
              ) : (
                'Save changes'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
