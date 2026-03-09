// @ts-nocheck
'use client';

import { useState } from 'react';
import { Badge, SearchInput } from '@/components/admin/ui';

interface Token {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt?: string;
  lastUsed?: string;
  usageCount: number;
  rateLimit?: {
    requests: number;
    window: number;
  };
  createdBy: {
    id: string;
    name: string;
  };
}

interface TokenListProps {
  tokens: Token[];
  onSelect?: (token: Token) => void;
  onRevoke?: (tokenId: string) => void;
  onRefresh?: (tokenId: string) => void;
}

export function TokenList({ tokens, onSelect, onRevoke, onRefresh }: TokenListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredTokens = tokens.filter(token => {
    const matchesSearch = !search ||
      token.name.toLowerCase().includes(search.toLowerCase()) ||
      token.prefix.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || token.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusVariant = (status: Token['status']): 'success' | 'danger' | 'warning' => {
    switch (status) {
      case 'active': return 'success';
      case 'revoked': return 'danger';
      case 'expired': return 'warning';
    }
  };

  const isExpiringSoon = (expiresAt?: string) => {
    if (!expiresAt) return false;
    const daysUntilExpiry = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tokens..."
          className="w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Token List */}
      {filteredTokens.length === 0 ? (
        <div className="p-8 bg-surface border border-border rounded-xl text-center">
          <p className="text-text-muted">
            {search || statusFilter !== 'all' ? 'No tokens match your filters' : 'No API tokens created yet'}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-hover">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Token</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Scopes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Usage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Expires</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTokens.map((token) => (
                <tr
                  key={token.id}
                  onClick={() => onSelect?.(token)}
                  className={`border-b border-border last:border-0 hover:bg-surface-hover ${onSelect ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-text-primary">{token.name}</p>
                      <p className="text-xs text-text-muted font-mono">{token.prefix}...</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {token.scopes.slice(0, 3).map((scope) => (
                        <Badge key={scope} variant="default" size="sm">
                          {scope}
                        </Badge>
                      ))}
                      {token.scopes.length > 3 && (
                        <Badge variant="default" size="sm">
                          +{token.scopes.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getStatusVariant(token.status)}>
                      {token.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <p className="text-text-primary">{token.usageCount.toLocaleString()} requests</p>
                      {token.lastUsed && (
                        <p className="text-xs text-text-muted">
                          Last: {new Date(token.lastUsed).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {token.expiresAt ? (
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${
                          isExpiringSoon(token.expiresAt) ? 'text-yellow-500' : 'text-text-muted'
                        }`}>
                          {new Date(token.expiresAt).toLocaleDateString()}
                        </span>
                        {isExpiringSoon(token.expiresAt) && (
                          <Badge variant="warning" size="sm">Soon</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-text-muted">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {token.status === 'active' && onRefresh && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRefresh(token.id);
                          }}
                          className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors"
                          title="Refresh token"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                      {token.status === 'active' && onRevoke && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRevoke(token.id);
                          }}
                          className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          title="Revoke token"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TokenList;
