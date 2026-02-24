'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { LabelArtist, CatalogEntry } from '@exprsn/shared';

interface LabelSettingsProps {
  organizationId: string;
  enabledFeatures: string[];
  userPermissions: string[];
}

export function LabelSettings({
  organizationId,
  enabledFeatures,
  userPermissions,
}: LabelSettingsProps) {
  const [activeTab, setActiveTab] = useState<'artists' | 'catalog' | 'royalties'>('artists');
  const [artists, setArtists] = useState<LabelArtist[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageArtists = userPermissions.includes('org.artists.manage');
  const canViewArtists = userPermissions.includes('org.artists.view') || canManageArtists;
  const canManageCatalog = userPermissions.includes('org.catalog.manage');
  const canViewCatalog = userPermissions.includes('org.catalog.view') || canManageCatalog;

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [artistsRes, catalogRes] = await Promise.all([
        canViewArtists
          ? api.get(`/xrpc/io.exprsn.org.label.artists.list?organizationId=${organizationId}`)
          : Promise.resolve({ artists: [] }),
        canViewCatalog
          ? api.get(`/xrpc/io.exprsn.org.label.catalog.list?organizationId=${organizationId}`)
          : Promise.resolve({ entries: [] }),
      ]);

      setArtists(artistsRes.artists || []);
      setCatalog(catalogRes.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-10 bg-surface rounded w-48" />
        <div className="animate-pulse h-64 bg-surface rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg w-fit">
        {(['artists', 'catalog', 'royalties'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'artists' && (
        <ArtistManagement
          organizationId={organizationId}
          artists={artists}
          canManage={canManageArtists}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'catalog' && (
        <CatalogManagement
          organizationId={organizationId}
          catalog={catalog}
          artists={artists}
          canManage={canManageCatalog}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'royalties' && (
        <RoyaltyTracking
          organizationId={organizationId}
          artists={artists}
          catalog={catalog}
        />
      )}
    </div>
  );
}

// Artist Management Component
function ArtistManagement({
  organizationId,
  artists,
  canManage,
  onUpdate,
}: {
  organizationId: string;
  artists: LabelArtist[];
  canManage: boolean;
  onUpdate: () => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newArtist, setNewArtist] = useState({
    stageName: '',
    bio: '',
    genres: [] as string[],
    contractStatus: 'pending' as const,
  });

  const handleAddArtist = async () => {
    try {
      await api.post('/xrpc/io.exprsn.org.label.artists.add', {
        organizationId,
        ...newArtist,
      });
      setShowAddModal(false);
      setNewArtist({ stageName: '', bio: '', genres: [], contractStatus: 'pending' });
      onUpdate();
    } catch (err) {
      console.error('Failed to add artist:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Artists ({artists.length})</h3>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            Add Artist
          </button>
        )}
      </div>

      {/* Artists List */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {artists.map((artist) => (
          <div
            key={artist.id}
            className="p-4 bg-surface rounded-lg border border-border"
          >
            <div className="flex items-start gap-3">
              {artist.avatar ? (
                <img
                  src={artist.avatar}
                  alt={artist.stageName}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center">
                  <span className="text-xl">{artist.stageName.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{artist.stageName}</h4>
                {artist.legalName && (
                  <p className="text-sm text-text-muted truncate">{artist.legalName}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {artist.genres?.slice(0, 3).map((genre) => (
                    <span
                      key={genre}
                      className="px-2 py-0.5 text-xs bg-surface-hover rounded-full"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  artist.contractStatus === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : artist.contractStatus === 'pending'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {artist.contractStatus}
              </span>
              {artist.royaltyPercentage !== undefined && (
                <span className="text-text-muted">{artist.royaltyPercentage}% royalty</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {artists.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No artists yet. {canManage && 'Add your first artist to get started.'}
        </div>
      )}

      {/* Add Artist Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Artist</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Stage Name</label>
                <input
                  type="text"
                  value={newArtist.stageName}
                  onChange={(e) => setNewArtist({ ...newArtist, stageName: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg"
                  placeholder="Enter stage name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  value={newArtist.bio}
                  onChange={(e) => setNewArtist({ ...newArtist, bio: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg h-24 resize-none"
                  placeholder="Artist biography..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Genres (comma-separated)</label>
                <input
                  type="text"
                  onChange={(e) =>
                    setNewArtist({
                      ...newArtist,
                      genres: e.target.value.split(',').map((g) => g.trim()).filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg"
                  placeholder="Pop, R&B, Hip-Hop"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddArtist}
                disabled={!newArtist.stageName}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                Add Artist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Catalog Management Component
function CatalogManagement({
  organizationId,
  catalog,
  artists,
  canManage,
  onUpdate,
}: {
  organizationId: string;
  catalog: CatalogEntry[];
  artists: LabelArtist[];
  canManage: boolean;
  onUpdate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Catalog ({catalog.length} releases)</h3>
        {canManage && (
          <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            Add Release
          </button>
        )}
      </div>

      {/* Catalog List */}
      <div className="space-y-3">
        {catalog.map((entry) => {
          const artist = artists.find((a) => a.id === entry.artistId);
          return (
            <div
              key={entry.id}
              className="p-4 bg-surface rounded-lg border border-border flex items-center gap-4"
            >
              {entry.coverArt ? (
                <img
                  src={entry.coverArt}
                  alt={entry.title}
                  className="w-16 h-16 rounded object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded bg-surface-hover flex items-center justify-center">
                  <span className="text-2xl">💿</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{entry.title}</h4>
                <p className="text-sm text-text-muted truncate">
                  {artist?.stageName || 'Unknown Artist'}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                  <span className="capitalize">{entry.type}</span>
                  {entry.tracks && (
                    <>
                      <span>•</span>
                      <span>{entry.tracks.length} tracks</span>
                    </>
                  )}
                  {entry.releaseDate && (
                    <>
                      <span>•</span>
                      <span>{new Date(entry.releaseDate).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs ${
                  entry.status === 'released'
                    ? 'bg-green-500/20 text-green-400'
                    : entry.status === 'draft'
                    ? 'bg-gray-500/20 text-gray-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}
              >
                {entry.status}
              </span>
            </div>
          );
        })}
      </div>

      {catalog.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No releases yet. {canManage && 'Add your first release to the catalog.'}
        </div>
      )}
    </div>
  );
}

// Royalty Tracking Component
function RoyaltyTracking({
  organizationId,
  artists,
  catalog,
}: {
  organizationId: string;
  artists: LabelArtist[];
  catalog: CatalogEntry[];
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Royalty Overview</h3>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="p-4 bg-surface rounded-lg border border-border">
          <p className="text-sm text-text-muted">Total Artists</p>
          <p className="text-2xl font-bold">{artists.length}</p>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <p className="text-sm text-text-muted">Total Releases</p>
          <p className="text-2xl font-bold">{catalog.length}</p>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <p className="text-sm text-text-muted">Avg. Artist Royalty</p>
          <p className="text-2xl font-bold">
            {artists.length > 0
              ? Math.round(
                  artists.reduce((sum, a) => sum + (a.royaltyPercentage || 0), 0) / artists.length
                )
              : 0}
            %
          </p>
        </div>
      </div>

      {/* Artist Royalty Breakdown */}
      <div className="space-y-3">
        <h4 className="font-medium">Artist Royalty Splits</h4>
        {artists.map((artist) => {
          const artistReleases = catalog.filter((c) => c.artistId === artist.id);
          return (
            <div
              key={artist.id}
              className="p-4 bg-surface rounded-lg border border-border flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {artist.avatar ? (
                  <img
                    src={artist.avatar}
                    alt={artist.stageName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                    <span>{artist.stageName.charAt(0)}</span>
                  </div>
                )}
                <div>
                  <p className="font-medium">{artist.stageName}</p>
                  <p className="text-sm text-text-muted">{artistReleases.length} releases</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{artist.royaltyPercentage || 0}%</p>
                <p className="text-xs text-text-muted">Base royalty rate</p>
              </div>
            </div>
          );
        })}
      </div>

      {artists.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          Add artists to see royalty tracking information.
        </div>
      )}
    </div>
  );
}
