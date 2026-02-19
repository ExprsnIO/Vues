'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type AnnouncementType = 'info' | 'warning' | 'success' | 'maintenance';
type AnnouncementStatus = 'draft' | 'active' | 'scheduled' | 'expired';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  status: AnnouncementStatus;
  targetAudience: 'all' | 'verified' | 'creators' | 'new';
  dismissible: boolean;
  startAt?: string;
  endAt?: string;
  createdAt: string;
  createdBy: {
    did: string;
    handle: string;
  };
  viewCount: number;
  dismissCount: number;
}

export default function AdminAnnouncementsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | ''>('');
  const queryClient = useQueryClient();

  // Fetch announcements
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'announcements', { status: statusFilter }],
    queryFn: async () => {
      if ('getAdminAnnouncements' in api && typeof (api as Record<string, unknown>).getAdminAnnouncements === 'function') {
        return (api as unknown as { getAdminAnnouncements: (opts?: { status?: string }) => Promise<{ announcements: Announcement[] }> }).getAdminAnnouncements({ status: statusFilter || undefined });
      }
      return { announcements: [] as Announcement[] };
    },
  });

  // Create announcement mutation
  const createMutation = useMutation({
    mutationFn: async (data: Omit<Announcement, 'id' | 'createdAt' | 'createdBy' | 'viewCount' | 'dismissCount'>) => {
      if ('createAnnouncement' in api && typeof (api as Record<string, unknown>).createAnnouncement === 'function') {
        return (api as unknown as { createAnnouncement: (data: any) => Promise<{ success: boolean; announcementId: string }> }).createAnnouncement(data);
      }
      throw new Error('Not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      setShowCreateModal(false);
      toast.success('Announcement created');
    },
    onError: () => {
      toast.error('Failed to create announcement');
    },
  });

  // Update announcement mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; status?: AnnouncementStatus }) => {
      if ('updateAnnouncement' in api && typeof (api as Record<string, unknown>).updateAnnouncement === 'function') {
        return (api as unknown as { updateAnnouncement: (data: any) => Promise<{ success: boolean }> }).updateAnnouncement(data);
      }
      throw new Error('Not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      toast.success('Announcement updated');
    },
    onError: () => {
      toast.error('Failed to update announcement');
    },
  });

  // Delete announcement mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if ('deleteAnnouncement' in api && typeof (api as Record<string, unknown>).deleteAnnouncement === 'function') {
        return (api as unknown as { deleteAnnouncement: (id: string) => Promise<{ success: boolean }> }).deleteAnnouncement(id);
      }
      throw new Error('Not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      setSelectedAnnouncement(null);
      toast.success('Announcement deleted');
    },
    onError: () => {
      toast.error('Failed to delete announcement');
    },
  });

  const announcements = data?.announcements || [];

  const getTypeBadge = (type: AnnouncementType) => {
    const colors: Record<AnnouncementType, string> = {
      info: 'bg-blue-500/10 text-blue-500',
      warning: 'bg-yellow-500/10 text-yellow-500',
      success: 'bg-green-500/10 text-green-500',
      maintenance: 'bg-orange-500/10 text-orange-500',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[type]}`}>
        {type}
      </span>
    );
  };

  const getStatusBadge = (status: AnnouncementStatus) => {
    const colors: Record<AnnouncementStatus, string> = {
      draft: 'bg-gray-500/10 text-gray-500',
      active: 'bg-green-500/10 text-green-500',
      scheduled: 'bg-blue-500/10 text-blue-500',
      expired: 'bg-red-500/10 text-red-500',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Announcements</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          New Announcement
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AnnouncementStatus | '')}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Announcements List */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <MegaphoneIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">No announcements</h2>
          <p className="text-text-muted mb-4">
            Create an announcement to broadcast messages to your users.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            Create Announcement
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="bg-surface border border-border rounded-xl p-6 hover:border-accent transition-colors cursor-pointer"
              onClick={() => setSelectedAnnouncement(announcement)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getTypeBadge(announcement.type)}
                  {getStatusBadge(announcement.status)}
                  <span className="text-xs text-text-muted capitalize">
                    {announcement.targetAudience} users
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(announcement.createdAt).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{announcement.title}</h3>
              <p className="text-text-muted text-sm line-clamp-2 mb-4">{announcement.message}</p>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>By @{announcement.createdBy.handle}</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <EyeIcon className="w-4 h-4" />
                    {announcement.viewCount.toLocaleString()} views
                  </span>
                  {announcement.dismissible && (
                    <span className="flex items-center gap-1">
                      <XIcon className="w-4 h-4" />
                      {announcement.dismissCount.toLocaleString()} dismissed
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <AnnouncementModal
          title="Create Announcement"
          onClose={() => setShowCreateModal(false)}
          onSave={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Detail/Edit Modal */}
      {selectedAnnouncement && (
        <AnnouncementDetailModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
          onActivate={() => updateMutation.mutate({ id: selectedAnnouncement.id, status: 'active' })}
          onDeactivate={() => updateMutation.mutate({ id: selectedAnnouncement.id, status: 'expired' })}
          onDelete={() => deleteMutation.mutate(selectedAnnouncement.id)}
          isLoading={updateMutation.isPending || deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function AnnouncementModal({
  title,
  announcement,
  onClose,
  onSave,
  isLoading,
}: {
  title: string;
  announcement?: Announcement;
  onClose: () => void;
  onSave: (data: any) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    title: announcement?.title || '',
    message: announcement?.message || '',
    type: announcement?.type || 'info' as AnnouncementType,
    status: announcement?.status || 'draft' as AnnouncementStatus,
    targetAudience: announcement?.targetAudience || 'all' as 'all' | 'verified' | 'creators' | 'new',
    dismissible: announcement?.dismissible ?? true,
    startAt: announcement?.startAt || '',
    endAt: announcement?.endAt || '',
  });

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Title and message are required');
      return;
    }
    onSave({
      ...formData,
      startAt: formData.startAt || undefined,
      endAt: formData.endAt || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-text-primary mb-6">{title}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Announcement title"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Message</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Announcement message..."
              rows={4}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as AnnouncementType })}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Audience</label>
              <select
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value as any })}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="all">All users</option>
                <option value="verified">Verified users</option>
                <option value="creators">Creators</option>
                <option value="new">New users</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Start date (optional)</label>
              <input
                type="datetime-local"
                value={formData.startAt}
                onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">End date (optional)</label>
              <input
                type="datetime-local"
                value={formData.endAt}
                onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-text-primary">Dismissible</p>
              <p className="text-xs text-text-muted">Allow users to dismiss this announcement</p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, dismissible: !formData.dismissible })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                formData.dismissible ? 'bg-accent' : 'bg-surface-hover'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  formData.dismissible ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.title.trim() || !formData.message.trim()}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnouncementDetailModal({
  announcement,
  onClose,
  onActivate,
  onDeactivate,
  onDelete,
  isLoading,
}: {
  announcement: Announcement;
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getTypeColor = (type: AnnouncementType) => {
    const colors: Record<AnnouncementType, string> = {
      info: 'bg-blue-500/10 border-blue-500/20',
      warning: 'bg-yellow-500/10 border-yellow-500/20',
      success: 'bg-green-500/10 border-green-500/20',
      maintenance: 'bg-orange-500/10 border-orange-500/20',
    };
    return colors[type];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-text-primary mb-6">Announcement Details</h2>

        {/* Preview */}
        <div className={`p-4 rounded-xl border mb-6 ${getTypeColor(announcement.type)}`}>
          <h3 className="font-semibold text-text-primary mb-2">{announcement.title}</h3>
          <p className="text-text-secondary text-sm">{announcement.message}</p>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs text-text-muted mb-1">Status</label>
            <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
              announcement.status === 'active' ? 'bg-green-500/10 text-green-500' :
              announcement.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500' :
              announcement.status === 'draft' ? 'bg-gray-500/10 text-gray-500' :
              'bg-red-500/10 text-red-500'
            }`}>
              {announcement.status}
            </span>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <span className="text-text-primary capitalize">{announcement.type}</span>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Audience</label>
            <span className="text-text-primary capitalize">{announcement.targetAudience}</span>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Dismissible</label>
            <span className="text-text-primary">{announcement.dismissible ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Views</label>
            <span className="text-text-primary">{announcement.viewCount.toLocaleString()}</span>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Dismissed</label>
            <span className="text-text-primary">{announcement.dismissCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {announcement.status === 'active' ? (
            <button
              onClick={onDeactivate}
              disabled={isLoading}
              className="flex-1 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg transition-colors disabled:opacity-50"
            >
              Deactivate
            </button>
          ) : announcement.status !== 'expired' ? (
            <button
              onClick={onActivate}
              disabled={isLoading}
              className="flex-1 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors disabled:opacity-50"
            >
              Activate
            </button>
          ) : null}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isLoading}
            className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-background/95 rounded-2xl flex flex-col items-center justify-center p-6">
            <WarningIcon className="w-12 h-12 text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-text-primary mb-2">Delete announcement?</h3>
            <p className="text-text-muted text-sm text-center mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={isLoading}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
