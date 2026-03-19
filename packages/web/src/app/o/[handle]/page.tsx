'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api, API_BASE, type OrganizationPublicProfileView, type VideoView } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import toast from 'react-hot-toast';

type TabType = 'videos' | 'about' | 'members';

export default function OrganizationProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('videos');

  // Fetch organization profile
  const { data, isLoading, error } = useQuery({
    queryKey: ['org-profile', handle],
    queryFn: () => api.getOrgProfile(handle),
  });

  // Fetch organization videos
  const { data: videosData, isLoading: videosLoading } = useQuery({
    queryKey: ['org-videos', data?.organization?.id],
    queryFn: () => api.getOrgVideos(data!.organization.id),
    enabled: !!data?.organization?.id,
  });

  // Hierarchy queries — only fire for authenticated users (auth-required endpoints)
  const { data: ancestorsData } = useQuery({
    queryKey: ['org-ancestors', data?.organization?.id],
    queryFn: () => api.getOrganizationAncestors(data!.organization.id),
    enabled: !!user && !!data?.organization?.id,
  });

  const { data: childrenData } = useQuery({
    queryKey: ['org-children', data?.organization?.id],
    queryFn: () => api.getOrganizationChildren(data!.organization.id),
    enabled: !!user && !!data?.organization?.id,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: () => api.followOrg(data!.organization.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-profile', handle] });
      toast.success(`Now following ${data?.organization.displayName || data?.organization.name}`);
    },
    onError: () => {
      toast.error('Failed to follow organization');
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: () => api.unfollowOrg(data!.organization.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-profile', handle] });
      toast.success(`Unfollowed ${data?.organization.displayName || data?.organization.name}`);
    },
    onError: () => {
      toast.error('Failed to unfollow organization');
    },
  });

  const handleFollowClick = () => {
    if (!user) {
      window.location.href = '/login?redirect=' + encodeURIComponent(`/o/${handle}`);
      return;
    }
    if (data?.organization.isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const org = data?.organization;
  const videos = videosData?.videos || [];
  const isMember = org?.isMember;
  const isFollowing = org?.isFollowing;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        {isLoading ? (
          <ProfileSkeleton />
        ) : error || !org ? (
          <div className="max-w-4xl mx-auto px-4 py-20 text-center">
            <OrgIcon className="w-16 h-16 mx-auto text-text-muted mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">Organization not found</h2>
            <p className="text-text-muted">
              The organization @{handle} doesn't exist or has been removed.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
            >
              Go Home
            </Link>
          </div>
        ) : (
          <>
            {/* Banner */}
            <div className="relative h-48 bg-gradient-to-br from-accent/20 to-accent/5">
              {org.bannerImage && (
                <img
                  src={org.bannerImage}
                  alt={`${org.displayName || org.name} banner`}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            <div className="max-w-4xl mx-auto px-4">
              {/* Profile Header */}
              <div className="relative -mt-16 mb-6">
                {/* Avatar */}
                <div className="w-32 h-32 rounded-2xl bg-surface border-4 border-background flex items-center justify-center overflow-hidden shadow-lg">
                  {org.avatar ? (
                    <img
                      src={org.avatar}
                      alt={org.displayName || org.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-bold text-accent">
                      {(org.displayName || org.name)[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Profile Info */}
              <div className="mb-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    {/* Parent breadcrumb — only shown to authenticated users when ancestors exist */}
                    {user && ancestorsData && ancestorsData.ancestors.length > 0 && (
                      <nav className="flex items-center gap-1 mb-2 flex-wrap">
                        {ancestorsData.ancestors.map((ancestor, index) => (
                          <span key={ancestor.id} className="flex items-center gap-1">
                            {index > 0 && (
                              <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                            <Link
                              href={`/o/${ancestor.name}`}
                              className="text-xs text-text-muted hover:text-accent transition-colors"
                            >
                              {ancestor.name}
                            </Link>
                          </span>
                        ))}
                        <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-xs text-text-muted font-medium">{org.displayName || org.name}</span>
                      </nav>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-2xl font-bold text-text-primary">
                        {org.displayName || org.name}
                      </h1>
                      {org.verified && <VerifiedBadge />}
                      <TypeBadge type={org.type} />
                    </div>
                    <p className="text-text-muted mb-4">@{org.handle || org.name}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    {isMember ? (
                      <Link
                        href="/settings?tab=organizations"
                        className="px-6 py-2 border border-border rounded-lg text-text-primary hover:bg-surface transition-colors"
                      >
                        Manage
                      </Link>
                    ) : (
                      <button
                        onClick={handleFollowClick}
                        disabled={followMutation.isPending || unfollowMutation.isPending}
                        className={cn(
                          'px-6 py-2 rounded-lg font-medium transition-colors',
                          isFollowing
                            ? 'border border-border text-text-primary hover:bg-surface'
                            : 'bg-accent text-text-inverse hover:bg-accent-hover'
                        )}
                      >
                        {followMutation.isPending || unfollowMutation.isPending
                          ? '...'
                          : isFollowing
                            ? 'Following'
                            : 'Follow'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 mb-4">
                  <div>
                    <span className="font-semibold text-text-primary">{formatCount(org.followerCount || 0)}</span>
                    <span className="text-text-muted ml-1">Followers</span>
                  </div>
                  <div>
                    <span className="font-semibold text-text-primary">{formatCount(org.videoCount || 0)}</span>
                    <span className="text-text-muted ml-1">Videos</span>
                  </div>
                  <div>
                    <span className="font-semibold text-text-primary">{formatCount(org.memberCount || 0)}</span>
                    <span className="text-text-muted ml-1">Members</span>
                  </div>
                </div>

                {/* Bio */}
                {org.bio && (
                  <p className="text-text-primary mb-4 max-w-2xl">{org.bio}</p>
                )}

                {/* Location & Links */}
                <div className="flex flex-wrap items-center gap-4">
                  {org.location && (
                    <span className="flex items-center gap-1 text-text-muted text-sm">
                      <LocationIcon className="w-4 h-4" />
                      {org.location}
                    </span>
                  )}
                  {org.category && (
                    <span className="flex items-center gap-1 text-text-muted text-sm">
                      <CategoryIcon className="w-4 h-4" />
                      {org.category}
                    </span>
                  )}
                  {org.website && (
                    <a
                      href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent hover:underline text-sm"
                    >
                      <LinkIcon className="w-4 h-4" />
                      {org.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {org.socialLinks && (
                    <>
                      {org.socialLinks.twitter && (
                        <a
                          href={`https://twitter.com/${org.socialLinks.twitter.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-text-primary transition-colors"
                          title="Twitter"
                        >
                          <TwitterIcon className="w-5 h-5" />
                        </a>
                      )}
                      {org.socialLinks.instagram && (
                        <a
                          href={`https://instagram.com/${org.socialLinks.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-text-primary transition-colors"
                          title="Instagram"
                        >
                          <InstagramIcon className="w-5 h-5" />
                        </a>
                      )}
                      {org.socialLinks.youtube && (
                        <a
                          href={org.socialLinks.youtube.startsWith('http') ? org.socialLinks.youtube : `https://youtube.com/${org.socialLinks.youtube}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-text-primary transition-colors"
                          title="YouTube"
                        >
                          <YouTubeIcon className="w-5 h-5" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-border mb-6">
                <div className="flex gap-8">
                  <TabButton
                    active={activeTab === 'videos'}
                    onClick={() => setActiveTab('videos')}
                  >
                    Videos
                  </TabButton>
                  <TabButton
                    active={activeTab === 'about'}
                    onClick={() => setActiveTab('about')}
                  >
                    About
                  </TabButton>
                  <TabButton
                    active={activeTab === 'members'}
                    onClick={() => setActiveTab('members')}
                  >
                    Members
                  </TabButton>
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'videos' && (
                <VideosTab videos={videos} isLoading={videosLoading} />
              )}
              {activeTab === 'about' && (
                <AboutTab
                  organization={org}
                  childOrgs={user ? (childrenData?.organizations ?? null) : null}
                />
              )}
              {activeTab === 'members' && (
                <MembersTab organizationId={org.id} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'pb-4 px-2 font-medium transition-colors relative',
        active ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
      )}
    >
      {children}
      {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
    </button>
  );
}

function VideosTab({ videos, isLoading }: { videos: VideoView[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-[9/16] bg-surface rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-16">
        <VideoIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <p className="text-text-muted">No videos published yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {videos.map((video) => (
        <VideoThumbnail key={video.uri} video={video} />
      ))}
    </div>
  );
}

function AboutTab({
  organization,
  childOrgs,
}: {
  organization: OrganizationPublicProfileView;
  childOrgs: import('@/lib/api').OrganizationView[] | null;
}) {
  return (
    <div className="space-y-6 max-w-2xl">
      {organization.bio && (
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-2">About</h3>
          <p className="text-text-primary">{organization.bio}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg p-4">
          <p className="text-sm text-text-muted mb-1">Organization Type</p>
          <p className="text-text-primary capitalize">{organization.type}</p>
        </div>
        {organization.category && (
          <div className="bg-surface rounded-lg p-4">
            <p className="text-sm text-text-muted mb-1">Category</p>
            <p className="text-text-primary">{organization.category}</p>
          </div>
        )}
        {organization.location && (
          <div className="bg-surface rounded-lg p-4">
            <p className="text-sm text-text-muted mb-1">Location</p>
            <p className="text-text-primary">{organization.location}</p>
          </div>
        )}
        <div className="bg-surface rounded-lg p-4">
          <p className="text-sm text-text-muted mb-1">Members</p>
          <p className="text-text-primary">{formatCount(organization.memberCount || 0)}</p>
        </div>
      </div>

      {organization.socialLinks && Object.keys(organization.socialLinks).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-3">Links</h3>
          <div className="space-y-2">
            {organization.socialLinks.website && (
              <a
                href={organization.socialLinks.website.startsWith('http') ? organization.socialLinks.website : `https://${organization.socialLinks.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-accent hover:underline"
              >
                <LinkIcon className="w-4 h-4" />
                {organization.socialLinks.website}
              </a>
            )}
            {organization.socialLinks.twitter && (
              <a
                href={`https://twitter.com/${organization.socialLinks.twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-text-primary hover:text-accent"
              >
                <TwitterIcon className="w-4 h-4" />
                @{organization.socialLinks.twitter.replace('@', '')}
              </a>
            )}
            {organization.socialLinks.instagram && (
              <a
                href={`https://instagram.com/${organization.socialLinks.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-text-primary hover:text-accent"
              >
                <InstagramIcon className="w-4 h-4" />
                @{organization.socialLinks.instagram.replace('@', '')}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Teams & Sub-organizations — shown only to authenticated users when children exist */}
      {childOrgs !== null && childOrgs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-3">
            Teams &amp; Sub-organizations
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {childOrgs.map((child) => (
              <Link
                key={child.id}
                href={`/o/${child.name}`}
                className="flex-shrink-0 flex flex-col items-center gap-2 p-3 bg-surface rounded-xl border border-border hover:border-accent hover:bg-accent/5 transition-all w-36"
              >
                <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center overflow-hidden">
                  <span className="text-text-primary font-semibold text-lg">
                    {child.name[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-xs font-medium text-text-primary truncate">{child.name}</p>
                  <p className="text-xs text-text-muted capitalize">{child.type}</p>
                  <p className="text-xs text-text-muted">{formatCount(child.memberCount)} members</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MembersTab({ organizationId }: { organizationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['org-members', organizationId],
    queryFn: () => api.getOrganizationMembers(organizationId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-surface animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-surface rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-surface rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const members = data?.members || [];

  if (members.length === 0) {
    return (
      <div className="text-center py-16">
        <UsersIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <p className="text-text-muted">No public members</p>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    owner: '#f59e0b',
    admin: '#ef4444',
    member: '#22c55e',
  };

  return (
    <div className="space-y-4">
      {members.map((member) => (
        <Link
          key={member.id}
          href={`/profile/${member.user.handle}`}
          className="flex items-center gap-4 p-3 rounded-lg hover:bg-surface transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center overflow-hidden">
            {member.user.avatar ? (
              <img
                src={member.user.avatar}
                alt={member.user.displayName || member.user.handle}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-text-primary font-medium">
                {member.user.handle[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary truncate">
                {member.user.displayName || `@${member.user.handle}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">@{member.user.handle}</span>
              <span
                className="text-xs px-2 py-0.5 rounded capitalize"
                style={{
                  backgroundColor: roleColors[member.role] ? `${roleColors[member.role]}20` : 'var(--color-surface)',
                  color: roleColors[member.role] || 'var(--color-text-muted)',
                }}
              >
                {member.role}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function VideoThumbnail({ video }: { video: VideoView }) {
  const videoUrl = video.video?.cdnUrl || video.cdnUrl;

  return (
    <Link
      href={`/video/${encodeURIComponent(video.uri)}`}
      className="relative aspect-[9/16] bg-surface rounded-lg overflow-hidden group"
    >
      {video.video?.thumbnail || video.thumbnailUrl ? (
        <img
          src={video.video?.thumbnail || video.thumbnailUrl}
          alt={video.caption || 'Video thumbnail'}
          className="w-full h-full object-cover"
        />
      ) : videoUrl ? (
        <video
          src={videoUrl.startsWith('/') ? `${API_BASE}${videoUrl}` : videoUrl}
          className="w-full h-full object-cover"
          muted
          preload="metadata"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-muted">
          <PlayIcon className="w-12 h-12" />
        </div>
      )}

      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <PlayIcon className="w-12 h-12 text-white" />
      </div>

      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-3 text-white text-sm">
        <span className="flex items-center gap-1">
          <PlayIcon className="w-4 h-4" />
          {formatCount(video.viewCount)}
        </span>
        <span className="flex items-center gap-1">
          <HeartIcon className="w-4 h-4" />
          {formatCount(video.likeCount)}
        </span>
      </div>
    </Link>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-48 bg-surface" />
      <div className="max-w-4xl mx-auto px-4">
        <div className="relative -mt-16 mb-6">
          <div className="w-32 h-32 rounded-2xl bg-surface border-4 border-background" />
        </div>
        <div className="mb-8">
          <div className="h-8 w-48 bg-surface rounded mb-4" />
          <div className="h-4 w-32 bg-surface rounded mb-4" />
          <div className="flex gap-6 mb-4">
            <div className="h-4 w-24 bg-surface rounded" />
            <div className="h-4 w-24 bg-surface rounded" />
            <div className="h-4 w-24 bg-surface rounded" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[9/16] bg-surface rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const typeConfig: Record<string, { label: string; color: string }> = {
    team: { label: 'Team', color: 'bg-blue-500/10 text-blue-500' },
    company: { label: 'Company', color: 'bg-purple-500/10 text-purple-500' },
    brand: { label: 'Brand', color: 'bg-pink-500/10 text-pink-500' },
    network: { label: 'Network', color: 'bg-green-500/10 text-green-500' },
    channel: { label: 'Channel', color: 'bg-orange-500/10 text-orange-500' },
  };

  const config = typeConfig[type] || { label: type, color: 'bg-gray-500/10 text-gray-500' };

  return (
    <span className={cn('text-xs font-medium px-2 py-1 rounded-full capitalize', config.color)}>
      {config.label}
    </span>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return count.toString();
}

// Icons
function VerifiedBadge() {
  return (
    <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
  );
}

function OrgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function CategoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
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
