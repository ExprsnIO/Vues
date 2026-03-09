'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Screen = 'dashboard' | 'domains' | 'details';
type DomainType = 'hosted' | 'federated';
type DomainStatus = 'active' | 'pending' | 'suspended';
type DomainStatusFilter = 'all' | DomainStatus | 'inactive';
type DetailTab = 'overview' | 'users' | 'moderation' | 'reports';

interface Domain {
  id: string;
  name: string;
  domain: string;
  type: DomainType;
  status: DomainStatus;
  userCount: number;
  certificateCount: number;
  openReports: number;
  moderationQueue: number;
  pendingVerifications: number;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

const INITIAL_DOMAINS: Domain[] = [
  {
    id: 'dom-hosted-001',
    name: 'Exprsn Primary',
    domain: 'exprsn.local',
    type: 'hosted',
    status: 'active',
    userCount: 1540,
    certificateCount: 7,
    openReports: 3,
    moderationQueue: 5,
    pendingVerifications: 0,
  },
  {
    id: 'dom-federated-002',
    name: 'Creators Hub',
    domain: 'creators.example',
    type: 'federated',
    status: 'pending',
    userCount: 408,
    certificateCount: 0,
    openReports: 1,
    moderationQueue: 2,
    pendingVerifications: 3,
  },
  {
    id: 'dom-federated-003',
    name: 'Legacy Media',
    domain: 'legacy.example',
    type: 'federated',
    status: 'suspended',
    userCount: 231,
    certificateCount: 1,
    openReports: 9,
    moderationQueue: 14,
    pendingVerifications: 1,
  },
];

const DOMAIN_USERS: Record<string, Array<{ handle: string; role: string; status: string }>> = {
  'dom-hosted-001': [
    { handle: '@ops.exprsn', role: 'admin', status: 'active' },
    { handle: '@trust.exprsn', role: 'moderator', status: 'active' },
    { handle: '@analytics.exprsn', role: 'member', status: 'active' },
  ],
  'dom-federated-002': [
    { handle: '@owner.creators', role: 'admin', status: 'active' },
    { handle: '@reviewer.creators', role: 'moderator', status: 'invited' },
    { handle: '@newmod.creators', role: 'moderator', status: 'pending' },
  ],
  'dom-federated-003': [
    { handle: '@legacy.owner', role: 'admin', status: 'active' },
    { handle: '@legacy.support', role: 'member', status: 'active' },
  ],
};

const DOMAIN_REPORTS: Record<string, Array<{ id: string; reason: string; state: string }>> = {
  'dom-hosted-001': [
    { id: 'rpt-381', reason: 'spam', state: 'open' },
    { id: 'rpt-378', reason: 'copyright', state: 'open' },
    { id: 'rpt-362', reason: 'harassment', state: 'resolved' },
  ],
  'dom-federated-002': [
    { id: 'rpt-415', reason: 'spam', state: 'open' },
    { id: 'rpt-402', reason: 'other', state: 'resolved' },
  ],
  'dom-federated-003': [
    { id: 'rpt-440', reason: 'violence', state: 'open' },
    { id: 'rpt-437', reason: 'harassment', state: 'open' },
    { id: 'rpt-431', reason: 'spam', state: 'open' },
  ],
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function ClaudeAdminFlowPrototypePage() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [domains, setDomains] = useState<Domain[]>(INITIAL_DOMAINS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DomainStatusFilter>('all');
  const [selectedDomainId, setSelectedDomainId] = useState<string>(INITIAL_DOMAINS[0].id);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const stats = useMemo(() => {
    const active = domains.filter(d => d.status === 'active').length;
    const pending = domains.filter(d => d.status === 'pending').length;
    const suspended = domains.filter(d => d.status === 'suspended').length;
    return {
      total: domains.length,
      active,
      pending,
      suspended,
    };
  }, [domains]);

  const filteredDomains = useMemo(() => {
    return domains.filter(domain => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'inactive'
            ? false
            : domain.status === statusFilter;
      const query = search.trim().toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        domain.name.toLowerCase().includes(query) ||
        domain.domain.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [domains, search, statusFilter]);

  const selectedDomain = domains.find(d => d.id === selectedDomainId) ?? domains[0] ?? null;

  async function verifyDomain(domainId: string) {
    const target = domains.find(d => d.id === domainId);
    if (!target) {
      return;
    }

    setNotice(null);
    setVerifyingId(domainId);
    await sleep(650);

    if (target.status === 'suspended') {
      setNotice({
        kind: 'error',
        text: `${target.name} could not be verified. Suspended domains require manual review first.`,
      });
      setVerifyingId(null);
      return;
    }

    setDomains(prev =>
      prev.map(domain => {
        if (domain.id !== domainId) {
          return domain;
        }
        return {
          ...domain,
          status: 'active',
          certificateCount: Math.max(domain.certificateCount, 1),
          pendingVerifications: 0,
        };
      })
    );

    setNotice({
      kind: 'success',
      text: `${target.name} is now verified and moved to active domains.`,
    });
    setVerifyingId(null);
  }

  function openDomainDetails(domainId: string) {
    setSelectedDomainId(domainId);
    setDetailTab('overview');
    setScreen('details');
  }

  return (
    <div className="min-h-screen bg-background pt-16 pb-20 lg:pt-6 lg:pb-6">
      <main className="mx-auto w-full max-w-6xl px-4 space-y-6">
        <header className="bg-surface border border-border rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-muted">Interactive Prototype</p>
              <h1 className="text-2xl font-bold text-text-primary mt-1">
                CLAUDE.md Admin Domain Flow
              </h1>
              <p className="text-sm text-text-secondary mt-2 max-w-3xl">
                Simplest assumption: the notes imply an admin flow for domain lifecycle management
                from dashboard to domain verification and detail review.
              </p>
            </div>
            <Link
              href="/"
              className="px-3 py-2 bg-surface-hover hover:bg-border rounded-lg text-sm text-text-primary transition-colors"
            >
              Back to app
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StepButton isActive={screen === 'dashboard'} onClick={() => setScreen('dashboard')}>
              1. Dashboard
            </StepButton>
            <StepButton isActive={screen === 'domains'} onClick={() => setScreen('domains')}>
              2. Domains
            </StepButton>
            <StepButton
              isActive={screen === 'details'}
              onClick={() => {
                if (selectedDomain) {
                  setScreen('details');
                }
              }}
            >
              3. Domain detail
            </StepButton>
          </div>
        </header>

        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.kind === 'success'
                ? 'bg-success-muted border-success text-success'
                : 'bg-error-muted border-error text-error'
            }`}
          >
            {notice.text}
          </div>
        )}

        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-text-primary">Acceptance checks from notes</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Criterion done={screen !== 'dashboard'}>
              Admin can move from dashboard to domain management.
            </Criterion>
            <Criterion done={search.length > 0 || statusFilter !== 'all'}>
              Domains can be filtered/searched.
            </Criterion>
            <Criterion done={stats.pending === 0}>
              Pending domains can be verified into active status.
            </Criterion>
            <Criterion done={screen === 'details'}>
              Domain detail includes users, moderation, and reports tabs.
            </Criterion>
            <Criterion done={statusFilter === 'inactive' && filteredDomains.length === 0}>
              Empty results edge state is visible.
            </Criterion>
            <Criterion done={notice?.kind === 'error'}>
              Verification failure edge state is visible.
            </Criterion>
          </div>
        </section>

        {screen === 'dashboard' && (
          <section className="bg-surface border border-border rounded-xl p-5 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Admin Dashboard</h2>
              <p className="text-sm text-text-muted mt-1">
                Happy path starts by reviewing pending domains and promoting verified ones.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Domains" value={stats.total.toString()} />
              <MetricCard label="Active Domains" value={stats.active.toString()} tone="success" />
              <MetricCard label="Pending Domains" value={stats.pending.toString()} tone="warning" />
              <MetricCard label="Suspended Domains" value={stats.suspended.toString()} tone="error" />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setStatusFilter('pending');
                  setScreen('domains');
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
              >
                Review pending domains
              </button>
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setScreen('domains');
                }}
                className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
              >
                Open all domains
              </button>
              <button
                onClick={() => {
                  setSelectedDomainId('dom-federated-003');
                  setDetailTab('moderation');
                  setScreen('details');
                }}
                className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
              >
                Jump to risk review
              </button>
            </div>
          </section>
        )}

        {screen === 'domains' && (
          <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">Domains List</h2>
                <p className="text-sm text-text-muted mt-1">
                  Filter, verify, then open domain details.
                </p>
              </div>
              <div className="text-sm text-text-muted">
                Showing <span className="text-text-primary font-medium">{filteredDomains.length}</span>{' '}
                of {domains.length}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by name or domain"
                className="flex-1 min-w-[200px] px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value as DomainStatusFilter)}
                className="px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive (empty edge)</option>
              </select>
            </div>

            {filteredDomains.length === 0 ? (
              <div className="rounded-xl border border-border bg-background p-8 text-center">
                <p className="text-text-primary font-medium">No domains found</p>
                <p className="text-sm text-text-muted mt-2">
                  Edge state: empty results for the selected filter/search.
                </p>
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  className="mt-4 px-3 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg text-sm transition-colors"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-hover">
                    <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3">Domain</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Reports</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredDomains.map(domain => (
                      <tr key={domain.id} className="hover:bg-surface-hover/70 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{domain.name}</p>
                          <p className="text-xs text-text-muted">{domain.domain}</p>
                        </td>
                        <td className="px-4 py-3 text-text-secondary capitalize">{domain.type}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={domain.status} />
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{domain.userCount}</td>
                        <td className="px-4 py-3 text-text-secondary">{domain.openReports}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {domain.status !== 'active' && (
                              <button
                                onClick={() => verifyDomain(domain.id)}
                                disabled={verifyingId === domain.id}
                                className="px-2.5 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-text-inverse text-xs rounded-md transition-colors"
                              >
                                {verifyingId === domain.id ? 'Verifying...' : 'Verify'}
                              </button>
                            )}
                            <button
                              onClick={() => openDomainDetails(domain.id)}
                              className="px-2.5 py-1.5 bg-surface-hover hover:bg-border text-text-primary text-xs rounded-md transition-colors"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {screen === 'details' && selectedDomain && (
          <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{selectedDomain.name}</h2>
                <p className="text-sm text-text-muted mt-1">{selectedDomain.domain}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={selectedDomain.status} />
                <button
                  onClick={() => setScreen('domains')}
                  className="px-3 py-2 bg-surface-hover hover:bg-border text-text-primary text-sm rounded-lg transition-colors"
                >
                  Back to domains
                </button>
              </div>
            </div>

            {selectedDomain.status === 'suspended' && (
              <div className="rounded-lg border border-warning bg-warning-muted px-4 py-3 text-sm text-warning">
                Suspended edge state: moderation backlog must be resolved before verification can
                complete.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <TabButton
                isActive={detailTab === 'overview'}
                onClick={() => setDetailTab('overview')}
              >
                Overview
              </TabButton>
              <TabButton isActive={detailTab === 'users'} onClick={() => setDetailTab('users')}>
                Users
              </TabButton>
              <TabButton
                isActive={detailTab === 'moderation'}
                onClick={() => setDetailTab('moderation')}
              >
                Moderation
              </TabButton>
              <TabButton isActive={detailTab === 'reports'} onClick={() => setDetailTab('reports')}>
                Reports
              </TabButton>
            </div>

            {detailTab === 'overview' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Users" value={selectedDomain.userCount.toString()} />
                <MetricCard
                  label="Certificates"
                  value={selectedDomain.certificateCount.toString()}
                />
                <MetricCard label="Open Reports" value={selectedDomain.openReports.toString()} tone="error" />
                <MetricCard
                  label="Moderation Queue"
                  value={selectedDomain.moderationQueue.toString()}
                  tone="warning"
                />
              </div>
            )}

            {detailTab === 'users' && (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-hover">
                    <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-3">Handle</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(DOMAIN_USERS[selectedDomain.id] ?? []).map(user => (
                      <tr key={user.handle}>
                        <td className="px-4 py-3 text-text-primary">{user.handle}</td>
                        <td className="px-4 py-3 text-text-secondary capitalize">{user.role}</td>
                        <td className="px-4 py-3 text-text-secondary capitalize">{user.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'moderation' && (
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <p className="text-sm text-text-secondary">
                  Queue size: <span className="text-text-primary font-medium">{selectedDomain.moderationQueue}</span>
                </p>
                <p className="text-sm text-text-secondary">
                  Pending verification checks:{' '}
                  <span className="text-text-primary font-medium">
                    {selectedDomain.pendingVerifications}
                  </span>
                </p>
                <p className="text-sm text-text-muted">
                  Action rule: clear all high-severity queue items before domain verification can
                  be completed.
                </p>
              </div>
            )}

            {detailTab === 'reports' && (
              <div className="space-y-2">
                {(DOMAIN_REPORTS[selectedDomain.id] ?? []).map(report => (
                  <div
                    key={report.id}
                    className="rounded-lg border border-border bg-background px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm text-text-primary font-medium">{report.id}</p>
                      <p className="text-xs text-text-muted capitalize">{report.reason} report</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${
                        report.state === 'open'
                          ? 'border-warning text-warning bg-warning-muted'
                          : 'border-success text-success bg-success-muted'
                      }`}
                    >
                      {report.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function StepButton({
  children,
  isActive,
  onClick,
}: {
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm rounded-lg transition-colors ${
        isActive
          ? 'bg-accent text-text-inverse'
          : 'bg-surface-hover hover:bg-border text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function TabButton({
  children,
  isActive,
  onClick,
}: {
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm rounded-lg transition-colors ${
        isActive
          ? 'bg-accent text-text-inverse'
          : 'bg-surface-hover hover:bg-border text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: DomainStatus }) {
  const classes =
    status === 'active'
      ? 'bg-success-muted text-success border-success'
      : status === 'pending'
        ? 'bg-warning-muted text-warning border-warning'
        : 'bg-error-muted text-error border-error';
  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-xs border capitalize ${classes}`}>
      {status}
    </span>
  );
}

function Criterion({ children, done }: { children: React.ReactNode; done: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <span
        className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
          done ? 'bg-success text-text-inverse' : 'bg-surface-hover text-text-muted'
        }`}
      >
        {done ? 'OK' : '-'}
      </span>
      <p className="text-sm text-text-secondary">{children}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'error';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'error'
          ? 'text-error'
          : 'text-text-primary';
  return (
    <div className="bg-background border border-border rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${toneClass}`}>{value}</p>
    </div>
  );
}
