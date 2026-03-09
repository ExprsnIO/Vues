'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/admin/ui/DataTable';

interface ExprsnDirectory {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'syncing';
  lastSync?: string;
  recordCount: number;
  version: string;
}

export default function ExprsnDirectoriesPage() {
  const [search, setSearch] = useState('');

  const { data: directories = [], isLoading } = useQuery<ExprsnDirectory[]>({
    queryKey: ['admin', 'exprsn-directories'],
    queryFn: async () => {
      // TODO: Replace with actual API call
      return [
        {
          id: '1',
          name: 'Primary Directory',
          url: 'https://directory.exprsn.io',
          status: 'online',
          lastSync: new Date().toISOString(),
          recordCount: 125000,
          version: '1.2.0',
        },
        {
          id: '2',
          name: 'US-West Mirror',
          url: 'https://us-west.directory.exprsn.io',
          status: 'syncing',
          lastSync: new Date(Date.now() - 300000).toISOString(),
          recordCount: 124500,
          version: '1.2.0',
        },
        {
          id: '3',
          name: 'EU Mirror',
          url: 'https://eu.directory.exprsn.io',
          status: 'online',
          lastSync: new Date().toISOString(),
          recordCount: 125000,
          version: '1.2.0',
        },
      ];
    },
  });

  const filteredDirectories = directories.filter((dir) =>
    search ? dir.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  const columns = [
    {
      key: 'name',
      header: 'Directory Name',
      render: (dir: ExprsnDirectory) => (
        <div>
          <div className="font-medium text-text-primary">{dir.name}</div>
          <div className="text-sm text-text-muted">{dir.url}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (dir: ExprsnDirectory) => (
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            dir.status === 'online'
              ? 'bg-green-500/10 text-green-500'
              : dir.status === 'syncing'
              ? 'bg-yellow-500/10 text-yellow-500'
              : 'bg-red-500/10 text-red-500'
          }`}
        >
          {dir.status}
        </span>
      ),
    },
    {
      key: 'recordCount',
      header: 'Records',
      render: (dir: ExprsnDirectory) => (
        <span className="text-text-secondary">{dir.recordCount.toLocaleString()}</span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (dir: ExprsnDirectory) => (
        <span className="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted">
          v{dir.version}
        </span>
      ),
    },
    {
      key: 'lastSync',
      header: 'Last Sync',
      render: (dir: ExprsnDirectory) => (
        <span className="text-text-muted text-sm">
          {dir.lastSync ? new Date(dir.lastSync).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (dir: ExprsnDirectory) => (
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm text-accent hover:text-accent-hover">
            Sync Now
          </button>
          <button className="px-3 py-1 text-sm text-text-muted hover:text-text-primary">
            Configure
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Exprsn Directories</h1>
          <p className="text-text-muted mt-1">
            Manage Exprsn directory servers for identity and content discovery
          </p>
        </div>
        <button className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors">
          Add Directory
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Directories</p>
          <p className="text-2xl font-bold text-text-primary">{directories.length}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Online</p>
          <p className="text-2xl font-bold text-green-500">
            {directories.filter((d) => d.status === 'online').length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Syncing</p>
          <p className="text-2xl font-bold text-yellow-500">
            {directories.filter((d) => d.status === 'syncing').length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Records</p>
          <p className="text-2xl font-bold text-text-primary">
            {directories.reduce((sum, d) => sum + d.recordCount, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <input
          type="search"
          placeholder="Search directories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Table */}
      <DataTable
        data={filteredDirectories}
        columns={columns}
        keyExtractor={(dir) => dir.id}
        isLoading={isLoading}
        emptyMessage="No Exprsn directories configured"
      />
    </div>
  );
}
