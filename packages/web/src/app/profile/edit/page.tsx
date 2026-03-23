'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/** Validate and sanitize an image URL to prevent XSS via dangerous URI schemes. */
function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // Allow blob: and data:image/ URLs from local file picks
    if (url.startsWith('blob:') || /^data:image\//i.test(url)) return url;
    // Only allow http/https for remote URLs
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return null;
  } catch {
    return null;
  }
}

/** Renders a sanitized <img> — breaks the taint chain at the render boundary. */
function SafeImg({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const safeSrc = sanitizeImageUrl(src);
  if (!safeSrc) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safeSrc} alt={alt} className={className} />;
}

export default function EditProfilePage() {
  return <EditProfileContent />;
}

function EditProfileContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Load initial values from user
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setLocation(user.location || '');
      setWebsite(user.website || '');
      setTwitter(user.socialLinks?.twitter || '');
      setInstagram(user.socialLinks?.instagram || '');
      setYoutube(user.socialLinks?.youtube || '');
      setAvatarPreview(sanitizeImageUrl(user.avatar));
    }
  }, [user]);

  // Track changes
  useEffect(() => {
    if (user) {
      const nameChanged = displayName !== (user.displayName || '');
      const bioChanged = bio !== (user.bio || '');
      const locationChanged = location !== (user.location || '');
      const websiteChanged = website !== (user.website || '');
      const twitterChanged = twitter !== (user.socialLinks?.twitter || '');
      const instagramChanged = instagram !== (user.socialLinks?.instagram || '');
      const youtubeChanged = youtube !== (user.socialLinks?.youtube || '');
      const avatarChanged = avatarFile !== null;
      setHasChanges(nameChanged || bioChanged || locationChanged || websiteChanged || twitterChanged || instagramChanged || youtubeChanged || avatarChanged);
    }
  }, [displayName, bio, location, website, twitter, instagram, youtube, avatarFile, user]);

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
        location: location.trim() || undefined,
        website: website.trim() || undefined,
        socialLinks: {
          twitter: twitter.trim() || undefined,
          instagram: instagram.trim() || undefined,
          youtube: youtube.trim() || undefined,
        },
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
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
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
                  <SafeImg
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

            {/* Location */}
            <div>
              <label
                htmlFor="location"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                maxLength={50}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            {/* Website */}
            <div>
              <label
                htmlFor="website"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                Website
              </label>
              <input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            {/* Social Links */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-text-secondary">
                Social Links
              </label>

              {/* Twitter */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                  <TwitterIcon className="w-5 h-5 text-text-muted" />
                </div>
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="@username"
                  className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Instagram */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                  <InstagramIcon className="w-5 h-5 text-text-muted" />
                </div>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@username"
                  className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* YouTube */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                  <YouTubeIcon className="w-5 h-5 text-text-muted" />
                </div>
                <input
                  type="text"
                  value={youtube}
                  onChange={(e) => setYoutube(e.target.value)}
                  placeholder="@channel or channel URL"
                  className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
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

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
