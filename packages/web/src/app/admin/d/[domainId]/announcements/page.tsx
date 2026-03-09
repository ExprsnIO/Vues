// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  DataTable,
  Column,
  Modal,
  ModalBody,
  ModalFooter,
  FormField,
  Input,
  Textarea,
  Select,
  Toggle,
  Badge,
  RowActionMenu,
  DeleteConfirmDialog,
  PageSkeleton,
} from '@/components/admin/ui';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'error';
  active: boolean;
  priority: number;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  createdBy?: { handle: string };
}

export default function DomainAnnouncementsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'info' as const,
    priority: 0,
    active: true,
    startsAt: '',
    endsAt: '',
  });

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'announcements'],
    queryFn: () => api.adminDomainAnnouncementsList(domainId),
    enabled: !!domainId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainAnnouncementCreate(domainId, data),
    onSuccess: () => {
      toast.success('Announcement created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'announcements'] });
      setShowCreateModal(false);
      resetForm();
    },
    onError: () => {
      toast.error('Failed to create announcement');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.adminDomainAnnouncementUpdate(domainId, id, data),
    onSuccess: () => {
      toast.success('Announcement updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'announcements'] });
      setEditingAnnouncement(null);
      resetForm();
    },
    onError: () => {
      toast.error('Failed to update announcement');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainAnnouncementDelete(domainId, id),
    onSuccess: () => {
      toast.success('Announcement deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'announcements'] });
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Failed to delete announcement');
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'info',
      priority: 0,
      active: true,
      startsAt: '',
      endsAt: '',
    });
  };

  const openEditModal = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      priority: announcement.priority,
      active: announcement.active,
      startsAt: announcement.startsAt || '',
      endsAt: announcement.endsAt || '',
    });
  };

  const handleSubmit = () => {
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load announcements</p>
      </div>
    );
  }

  const announcements = data?.announcements || [];

  const typeColors: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
    info: 'info',
    warning: 'warning',
    success: 'success',
    error: 'error',
  };

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{row.title}</p>
          <p className="text-xs text-text-muted truncate max-w-[300px]">{row.content}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge variant={typeColors[row.type] || 'default'}>
          {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.active ? 'success' : 'default'} dot>
          {row.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <span className="text-sm text-text-muted">{row.priority}</span>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (row) => (
        <div className="text-xs text-text-muted">
          {row.startsAt && <p>From: {new Date(row.startsAt).toLocaleDateString()}</p>}
          {row.endsAt && <p>Until: {new Date(row.endsAt).toLocaleDateString()}</p>}
          {!row.startsAt && !row.endsAt && '-'}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        <RowActionMenu
          items={[
            { label: 'Edit', onClick: () => openEditModal(row) },
            { label: 'Delete', onClick: () => setDeleteId(row.id), variant: 'danger' },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description={`Manage announcements for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Create Announcement
          </button>
        }
      />

      <DataTable
        data={announcements}
        columns={columns}
        keyExtractor={(row) => row.id}
        emptyMessage="announcements"
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal || !!editingAnnouncement}
        onClose={() => {
          setShowCreateModal(false);
          setEditingAnnouncement(null);
          resetForm();
        }}
        title={editingAnnouncement ? 'Edit Announcement' : 'Create Announcement'}
        size="lg"
      >
        <ModalBody className="space-y-4">
          <FormField label="Title" required>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter announcement title"
            />
          </FormField>

          <FormField label="Content" required>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Enter announcement content"
              rows={4}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <Select
                value={formData.type}
                onChange={(e: any) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </Select>
            </FormField>

            <FormField label="Priority" hint="Higher numbers show first">
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" hint="Optional">
              <Input
                type="datetime-local"
                value={formData.startsAt}
                onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
              />
            </FormField>

            <FormField label="End Date" hint="Optional">
              <Input
                type="datetime-local"
                value={formData.endsAt}
                onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
              />
            </FormField>
          </div>

          <Toggle
            checked={formData.active}
            onChange={(active) => setFormData({ ...formData, active })}
            label="Active"
            description="Show this announcement to users"
          />
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => {
              setShowCreateModal(false);
              setEditingAnnouncement(null);
              resetForm();
            }}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending || !formData.title || !formData.content}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : editingAnnouncement
              ? 'Update'
              : 'Create'}
          </button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        itemType="announcement"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
