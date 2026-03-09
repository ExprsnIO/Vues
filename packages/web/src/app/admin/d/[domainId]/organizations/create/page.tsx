'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';

interface CreateOrganizationForm {
  name: string;
  handle: string;
  description: string;
  type: 'standard' | 'business' | 'enterprise' | 'nonprofit';
  visibility: 'public' | 'private' | 'unlisted';
  website?: string;
  email?: string;
}

export default function CreateOrganizationPage() {
  const params = useParams();
  const router = useRouter();
  const domainId = params.domainId as string;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CreateOrganizationForm>({
    name: '',
    handle: '',
    description: '',
    type: 'standard',
    visibility: 'public',
    website: '',
    email: '',
  });
  const [errors, setErrors] = useState<Partial<CreateOrganizationForm>>({});

  const createMutation = useMutation({
    mutationFn: async (data: CreateOrganizationForm) => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { id: 'new-org-id', ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'organizations'] });
      router.push(`/admin/d/${domainId}/organizations`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Partial<CreateOrganizationForm> = {};
    if (!form.name) newErrors.name = 'Name is required';
    if (!form.handle) newErrors.handle = 'Handle is required';
    if (form.handle && !/^[a-z0-9_-]+$/i.test(form.handle)) {
      newErrors.handle = 'Handle can only contain letters, numbers, hyphens, and underscores';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    createMutation.mutate(form);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Create Organization</h1>
          <p className="text-text-muted mt-1">
            Create a new organization in this domain
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Basic Information</h2>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Organization Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`w-full px-4 py-2 bg-background border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent ${
                errors.name ? 'border-red-500' : 'border-border'
              }`}
              placeholder="My Organization"
            />
            {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Handle *
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-surface-hover border border-r-0 border-border rounded-l-lg text-text-muted">
                @
              </span>
              <input
                type="text"
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
                className={`flex-1 px-4 py-2 bg-background border rounded-r-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent ${
                  errors.handle ? 'border-red-500' : 'border-border'
                }`}
                placeholder="my-org"
              />
            </div>
            {errors.handle && <p className="mt-1 text-sm text-red-500">{errors.handle}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              placeholder="Describe your organization..."
            />
          </div>
        </div>

        {/* Organization Type */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Organization Type</h2>

          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'standard', label: 'Standard', desc: 'For individuals and small teams' },
              { value: 'business', label: 'Business', desc: 'For companies and enterprises' },
              { value: 'enterprise', label: 'Enterprise', desc: 'Advanced features and support' },
              { value: 'nonprofit', label: 'Nonprofit', desc: 'For charitable organizations' },
            ].map((type) => (
              <label
                key={type.value}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  form.type === type.value
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={type.value}
                  checked={form.type === type.value}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as CreateOrganizationForm['type'] })
                  }
                  className="sr-only"
                />
                <div className="font-medium text-text-primary">{type.label}</div>
                <div className="text-sm text-text-muted">{type.desc}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Visibility</h2>

          <div className="space-y-2">
            {[
              { value: 'public', label: 'Public', desc: 'Anyone can find and view this organization' },
              { value: 'unlisted', label: 'Unlisted', desc: 'Only people with the link can view' },
              { value: 'private', label: 'Private', desc: 'Only members can view' },
            ].map((vis) => (
              <label
                key={vis.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  form.visibility === vis.value
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={vis.value}
                  checked={form.visibility === vis.value}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      visibility: e.target.value as CreateOrganizationForm['visibility'],
                    })
                  }
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-text-primary">{vis.label}</div>
                  <div className="text-sm text-text-muted">{vis.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Contact Information</h2>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Website
            </label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="contact@example.com"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link
            href={`/admin/d/${domainId}/organizations`}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Organization'}
          </button>
        </div>
      </form>
    </div>
  );
}
