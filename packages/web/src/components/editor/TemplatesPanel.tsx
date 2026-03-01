'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEditor } from '@/lib/editor-context';

// ============================================================================
// Types
// ============================================================================

interface EditorTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  aspectRatio: string;
  duration: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  isBuiltIn: boolean;
  isPublic: boolean;
  usageCount: number;
  tags: string[];
  ownerDid?: string;
  createdAt: string;
}

type TemplateCategory = 'all' | 'starter' | 'trending' | 'my-templates' | 'intro' | 'outro' | 'social' | 'music';

// ============================================================================
// Component
// ============================================================================

export function TemplatesPanel({
  onClose,
  onSelectTemplate,
}: {
  onClose: () => void;
  onSelectTemplate: (template: EditorTemplate) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { state } = useEditor();

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ['editor-templates', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all' && selectedCategory !== 'my-templates') {
        params.set('category', selectedCategory);
      }
      if (selectedCategory === 'my-templates') {
        params.set('ownerOnly', 'true');
      }
      if (searchQuery) {
        params.set('search', searchQuery);
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.listTemplates?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      return data.templates as EditorTemplate[];
    },
    staleTime: 30000,
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/xrpc/io.exprsn.studio.applyTemplate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('session')}`,
          },
          body: JSON.stringify({ templateId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to apply template');
      }

      return response.json();
    },
    onSuccess: (data, templateId) => {
      const template = templates?.find(t => t.id === templateId);
      if (template) {
        onSelectTemplate(template);
      }
      queryClient.invalidateQueries({ queryKey: ['editor-templates'] });
    },
  });

  const categories: { id: TemplateCategory; label: string; icon?: React.FC<{ className?: string }> }[] = [
    { id: 'all', label: 'All Templates' },
    { id: 'starter', label: 'Starter' },
    { id: 'trending', label: 'Trending' },
    { id: 'my-templates', label: 'My Templates' },
    { id: 'intro', label: 'Intro' },
    { id: 'outro', label: 'Outro' },
    { id: 'social', label: 'Social' },
    { id: 'music', label: 'Music Video' },
  ];

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];

    return templates.filter(template => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          template.name.toLowerCase().includes(query) ||
          template.description?.toLowerCase().includes(query) ||
          template.tags.some(tag => tag.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [templates, searchQuery]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div className="bg-background w-[900px] max-h-[80vh] rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Templates</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-border p-3 space-y-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col p-4">
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            {/* Templates Grid */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-[9/16] bg-surface rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <TemplateIcon className="w-12 h-12 mb-2 opacity-50" />
                  <p>No templates found</p>
                  {selectedCategory === 'my-templates' && (
                    <p className="text-sm mt-1">Save a project as a template to see it here</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {filteredTemplates.map(template => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      isHovered={hoveredTemplate === template.id}
                      onHover={() => setHoveredTemplate(template.id)}
                      onLeave={() => setHoveredTemplate(null)}
                      onSelect={() => applyTemplateMutation.mutate(template.id)}
                      isApplying={applyTemplateMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Template Card
// ============================================================================

function TemplateCard({
  template,
  isHovered,
  onHover,
  onLeave,
  onSelect,
  isApplying,
}: {
  template: EditorTemplate;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
  isApplying: boolean;
}) {
  const aspectClass =
    template.aspectRatio === '9:16'
      ? 'aspect-[9/16]'
      : template.aspectRatio === '1:1'
        ? 'aspect-square'
        : 'aspect-video';

  return (
    <div
      className="group relative rounded-lg overflow-hidden cursor-pointer"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className={`${aspectClass} bg-surface`}>
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent-hover/20">
            <TemplateIcon className="w-8 h-8 text-accent" />
          </div>
        )}

        {/* Preview video on hover */}
        {isHovered && template.previewVideoUrl && (
          <video
            src={template.previewVideoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Overlay */}
        <div
          className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            disabled={isApplying}
          >
            {isApplying ? 'Applying...' : 'Use Template'}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-2">
        <h3 className="text-sm font-medium text-text-primary truncate">{template.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-muted">{template.aspectRatio}</span>
          {template.isBuiltIn && (
            <span className="text-xs px-1.5 py-0.5 bg-accent/20 text-accent rounded">Built-in</span>
          )}
          {template.usageCount > 0 && (
            <span className="text-xs text-text-muted">{template.usageCount} uses</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Save As Template Modal
// ============================================================================

export function SaveAsTemplateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: { name: string; description: string; category: string; isPublic: boolean }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('social');
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name, description, category, isPublic });
  };

  const categoryOptions = [
    { value: 'intro', label: 'Intro' },
    { value: 'outro', label: 'Outro' },
    { value: 'social', label: 'Social' },
    { value: 'presentation', label: 'Presentation' },
    { value: 'music', label: 'Music Video' },
    { value: 'promo', label: 'Promo' },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div className="bg-background w-[400px] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Save as Template</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for?"
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <label htmlFor="isPublic" className="text-sm text-text-primary">
              Make this template public
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-text-primary border border-border rounded-lg hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            >
              Save Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}
