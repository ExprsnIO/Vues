'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { formatCount } from '@/lib/utils';
import {
  PageHeader,
  SearchInput,
  FilterDropdown,
  SimpleTabs,
  DataTable,
  Column,
  Badge,
  RowActionMenu,
  ConfirmDialog,
  PageSkeleton,
} from '@/components/admin/ui';

interface Content {
  uri: string;
  cid: string;
  type: 'video' | 'image' | 'post';
  caption?: string;
  thumbnail?: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  stats: {
    views: number;
    likes: number;
    comments: number;
  };
  status: 'published' | 'removed' | 'flagged' | 'processing';
  createdAt: string;
}

export default function DomainContentPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
  const [removeUri, setRemoveUri] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'content', activeTab, search, typeFilter, page],
    queryFn: () =>
      api.adminDomainContentList(domainId, {
        status: activeTab !== 'all' ? activeTab : undefined,
        search: search || undefined,
        types: typeFilter.length > 0 ? typeFilter : undefined,
        limit: 25,
        offset: (page - 1) * 25,
      }),
    enabled: !!domainId,
  });

  const removeContentMutation = useMutation({
    mutationFn: (uri: string) => api.adminDomainContentRemove(domainId, uri),
    onSuccess: () => {
      toast.success('Content removed');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'content'] });
      setRemoveUri(null);
    },
    onError: () => {
      toast.error('Failed to remove content');
    },
  });

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load content</p>
      </div>
    );
  }

  const contents = data?.content || [];
  const totalCount = data?.total || 0;
  const stats = data?.stats || {
    total: 0,
    published: 0,
    removed: 0,
    flagged: 0,
  };

  const tabs = [
    { id: 'all', label: 'All Content', badge: stats.total },
    { id: 'published', label: 'Published', badge: stats.published },
    { id: 'flagged', label: 'Flagged', badge: stats.flagged },
    { id: 'removed', label: 'Removed', badge: stats.removed },
  ];

  const typeOptions = [
    { value: 'video', label: 'Videos' },
    { value: 'image', label: 'Images' },
    { value: 'post', label: 'Posts' },
  ];

  const columns: Column<Content>[] = [
    {
      key: 'content',
      header: 'Content',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-16 h-10 rounded bg-surface-hover overflow-hidden flex-shrink-0">
            {row.thumbnail ? (
              <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted">
                {row.type === 'video' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : row.type === 'image' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-text-primary truncate max-w-[200px]">
              {row.caption || 'Untitled'}
            </p>
            <p className="text-xs text-text-muted font-mono truncate max-w-[200px]">
              {row.uri.split('/').pop()}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'author',
      header: 'Author',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-hover overflow-hidden">
            {row.author?.avatar ? (
              <img src={row.author.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                {row.author?.handle?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <span className="text-sm text-text-muted">@{row.author?.handle}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge variant="default">
          {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'stats',
      header: 'Stats',
      render: (row) => (
        <div className="text-sm text-text-muted space-x-3">
          <span>{formatCount(row.stats.views)} views</span>
          <span>{formatCount(row.stats.likes)} likes</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          variant={
            row.status === 'published'
              ? 'success'
              : row.status === 'removed'
              ? 'error'
              : row.status === 'flagged'
              ? 'warning'
              : 'info'
          }
          dot
        >
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </Badge>
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
            { label: 'View Content', onClick: () => window.open(`/content/${row.uri}`, '_blank') },
            { label: 'View Author', onClick: () => {} },
            row.status === 'removed'
              ? { label: 'Restore', onClick: () => {} }
              : { label: 'Remove', onClick: () => setRemoveUri(row.uri), variant: 'danger' as const },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Browser"
        description={`Browse and manage content in ${selectedDomain?.name || 'this domain'}`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={(tab) => { setActiveTab(tab); setPage(1); }} />
        <div className="flex-1" />
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search content..."
          className="w-64"
        />
        <FilterDropdown
          label="Type"
          options={typeOptions}
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
        />
      </div>

      <DataTable
        data={contents}
        columns={columns}
        keyExtractor={(row) => row.uri}
        loading={isLoading}
        selectable
        selectedKeys={selectedContent}
        onSelectionChange={setSelectedContent}
        totalCount={totalCount}
        pageSize={25}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="content"
      />

      {/* Remove Confirmation */}
      <ConfirmDialog
        isOpen={!!removeUri}
        onClose={() => setRemoveUri(null)}
        onConfirm={() => removeUri && removeContentMutation.mutate(removeUri)}
        title="Remove Content?"
        message="This will remove the content from public view. The content can be restored later if needed."
        confirmLabel="Remove"
        variant="danger"
        isLoading={removeContentMutation.isPending}
      />
    </div>
  );
}
