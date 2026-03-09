// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  SearchInput,
  FilterDropdown,
  DateRangePicker,
  DataTable,
  Column,
  Badge,
  PageSkeleton,
} from '@/components/admin/ui';

interface DateRange {
  start: Date | null;
  end: Date | null;
}

export default function DomainAuditPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'audit', search, actionFilter, dateRange, page],
    queryFn: () =>
      api.adminDomainAuditLogList(domainId, {
        search: search || undefined,
        actions: actionFilter.length > 0 ? actionFilter : undefined,
        startDate: dateRange.start?.toISOString(),
        endDate: dateRange.end?.toISOString(),
        limit: 50,
        offset: (page - 1) * 50,
      }),
    enabled: !!domainId,
  });

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load audit log</p>
      </div>
    );
  }

  const logs = data?.logs || [];
  const totalCount = data?.total || 0;

  const actionOptions = [
    { value: 'user.create', label: 'User Created' },
    { value: 'user.update', label: 'User Updated' },
    { value: 'user.delete', label: 'User Deleted' },
    { value: 'user.sanction', label: 'User Sanctioned' },
    { value: 'content.create', label: 'Content Created' },
    { value: 'content.update', label: 'Content Updated' },
    { value: 'content.delete', label: 'Content Deleted' },
    { value: 'content.feature', label: 'Content Featured' },
    { value: 'settings.update', label: 'Settings Updated' },
    { value: 'admin.add', label: 'Admin Added' },
    { value: 'admin.remove', label: 'Admin Removed' },
  ];

  const actionColors: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'> = {
    'user.create': 'success',
    'user.update': 'info',
    'user.delete': 'error',
    'user.sanction': 'warning',
    'content.create': 'success',
    'content.update': 'info',
    'content.delete': 'error',
    'content.feature': 'purple',
    'settings.update': 'info',
    'admin.add': 'purple',
    'admin.remove': 'error',
  };

  const columns: Column<any>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (row) => (
        <div>
          <p className="text-sm text-text-primary">{new Date(row.createdAt).toLocaleDateString()}</p>
          <p className="text-xs text-text-muted">{new Date(row.createdAt).toLocaleTimeString()}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge variant={actionColors[row.action] || 'default'}>
          {row.action.replace('.', ' ').replace(/^\w/, (c: string) => c.toUpperCase())}
        </Badge>
      ),
    },
    {
      key: 'actor',
      header: 'Performed By',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-hover overflow-hidden">
            {row.actor?.avatar ? (
              <img src={row.actor.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                {row.actor?.handle?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <span className="text-sm text-text-primary">@{row.actor?.handle || 'system'}</span>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) => {
        if (row.targetType === 'user' && row.targetUser) {
          return (
            <span className="text-sm text-text-muted">@{row.targetUser.handle}</span>
          );
        }
        if (row.targetType === 'content') {
          return (
            <span className="text-sm font-mono text-text-muted truncate max-w-[150px] block">
              {row.targetId?.slice(-12)}
            </span>
          );
        }
        return <span className="text-sm text-text-muted">{row.targetId || '-'}</span>;
      },
    },
    {
      key: 'details',
      header: 'Details',
      render: (row) => {
        if (!row.details) return <span className="text-text-muted">-</span>;
        const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
        return (
          <span className="text-sm text-text-muted truncate max-w-[200px] block">
            {Object.entries(details).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ')}
          </span>
        );
      },
    },
    {
      key: 'ip',
      header: 'IP Address',
      render: (row) => (
        <span className="text-sm font-mono text-text-muted">{row.ipAddress || '-'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description={`Activity history for ${selectedDomain?.name || 'this domain'}`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search by user, action, or details..."
          className="w-64"
        />
        <FilterDropdown
          label="Action"
          options={actionOptions}
          value={actionFilter}
          onChange={(value) => {
            setActionFilter(value);
            setPage(1);
          }}
        />
        <DateRangePicker
          value={dateRange}
          onChange={(range) => {
            setDateRange(range);
            setPage(1);
          }}
        />
      </div>

      {/* Audit Log Table */}
      <DataTable
        data={logs}
        columns={columns}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        totalCount={totalCount}
        pageSize={50}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="audit logs"
      />
    </div>
  );
}
