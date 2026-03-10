'use client';

import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Modal, ModalBody, ModalFooter } from '@/components/admin/ui/Modal';
import toast from 'react-hot-toast';

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateOrganizationModal({
  isOpen,
  onClose,
}: CreateOrganizationModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [type, setType] = useState<'team' | 'enterprise' | 'nonprofit' | 'business' | 'company' | 'network' | 'label' | 'brand' | 'channel'>('team');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>('public');
  const [contactEmail, setContactEmail] = useState('');

  // Owner search
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  } | null>(null);

  // Domain and parent org (optional for now)
  const [domainId, setDomainId] = useState<string | null>(null);
  const [parentOrganizationId, setParentOrganizationId] = useState<string | null>(null);

  // Owner search query
  const { data: ownerSearchResults, isLoading: isSearchingOwners } = useQuery({
    queryKey: ['users', 'search', ownerSearch],
    queryFn: () => api.searchUsers(ownerSearch, { limit: 10 }),
    enabled: ownerSearch.length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedOwner) {
        throw new Error('Owner is required');
      }

      return api.adminOrganizationsCreate({
        name: name.trim(),
        handle: handle.trim() || undefined,
        type,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        ownerDid: selectedOwner.did,
        visibility,
        domainId,
        parentOrganizationId,
        contactEmail: contactEmail.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Organization created successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create organization');
    },
  });

  const handleClose = () => {
    setName('');
    setHandle('');
    setType('team');
    setDescription('');
    setWebsite('');
    setVisibility('public');
    setContactEmail('');
    setOwnerSearch('');
    setSelectedOwner(null);
    setDomainId(null);
    setParentOrganizationId(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Organization name is required');
      return;
    }
    if (name.trim().length < 2 || name.trim().length > 100) {
      toast.error('Organization name must be 2-100 characters');
      return;
    }
    if (!selectedOwner) {
      toast.error('Please select an owner');
      return;
    }
    if (handle && !/^[a-z0-9-_]+$/.test(handle)) {
      toast.error('Handle must contain only lowercase letters, numbers, hyphens, and underscores');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Organization"
      description="Create a new organization with an assigned owner"
      size="lg"
    >
      <ModalBody>
        <div className="space-y-4">
          {/* Organization Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Organization"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-text-muted">2-100 characters</p>
          </div>

          {/* Handle */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Handle (Optional)
            </label>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="my-organization"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-text-muted">
              URL-friendly identifier (lowercase letters, numbers, hyphens, underscores)
            </p>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Organization Type <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="team">Team</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
              <option value="nonprofit">Nonprofit</option>
              <option value="company">Company</option>
              <option value="network">Network</option>
              <option value="label">Label</option>
              <option value="brand">Brand</option>
              <option value="channel">Channel</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the organization..."
              rows={3}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Website
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Contact Email */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@example.com"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Visibility
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <p className="mt-1 text-xs text-text-muted">
              {visibility === 'public' && 'Visible to everyone and appears in search results'}
              {visibility === 'unlisted' && 'Accessible via link but not in search results'}
              {visibility === 'private' && 'Only visible to members'}
            </p>
          </div>

          {/* Owner Selection */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Owner <span className="text-red-500">*</span>
            </label>
            {selectedOwner ? (
              <div className="flex items-center justify-between p-3 bg-surface-hover border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
                    {selectedOwner.avatar ? (
                      <img src={selectedOwner.avatar} alt={selectedOwner.handle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                        {selectedOwner.handle[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">
                      {selectedOwner.displayName || selectedOwner.handle}
                    </p>
                    <p className="text-sm text-text-muted">@{selectedOwner.handle}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOwner(null)}
                  className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary bg-surface hover:bg-border rounded-lg transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  placeholder="Search for user by handle or name..."
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {ownerSearch.length >= 2 && (
                  <div className="mt-2 border border-border rounded-lg bg-surface max-h-48 overflow-y-auto">
                    {isSearchingOwners ? (
                      <div className="p-4 text-center text-text-muted">Searching...</div>
                    ) : ownerSearchResults?.users && ownerSearchResults.users.length > 0 ? (
                      <div className="divide-y divide-border">
                        {ownerSearchResults.users.map((user) => (
                          <button
                            key={user.did}
                            onClick={() => {
                              setSelectedOwner(user);
                              setOwnerSearch('');
                            }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-surface-hover transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden">
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.handle} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                                  {user.handle[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-text-primary text-sm">
                                {user.displayName || user.handle}
                              </p>
                              <p className="text-xs text-text-muted">@{user.handle}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-text-muted">No users found</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !selectedOwner || createMutation.isPending}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Organization'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
