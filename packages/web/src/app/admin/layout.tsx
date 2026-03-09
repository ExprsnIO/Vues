'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api, QuickStats } from '@/lib/api';
import { AdminDomainProvider, useAdminDomain } from '@/lib/admin-domain-context';
import { DomainSelector } from '@/components/admin/DomainSelector';
import { CommandPaletteProvider, useAdminCommands } from '@/components/admin/ui/CommandPalette';

interface AdminSession {
  admin: {
    id: string;
    role: string;
    permissions: string[];
  };
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  } | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const STORAGE_KEY = 'admin-nav-expanded';
const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

function getInitialExpandedState(): string[] {
  if (typeof window === 'undefined') return ['users', 'content'];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : ['users', 'content'];
  } catch {
    return ['users', 'content'];
  }
}

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

// Navigation configuration for domain-scoped view
function getDomainNavGroups(domainId: string, stats?: QuickStats): NavGroup[] {
  return [
    {
      id: 'users',
      label: 'Users & Access',
      icon: UsersGroupIcon,
      items: [
        { href: `/admin/d/${domainId}/users`, label: 'Users', icon: UsersIcon },
        { href: `/admin/d/${domainId}/groups`, label: 'Groups', icon: TeamIcon },
        { href: `/admin/d/${domainId}/roles`, label: 'Roles', icon: RolesIcon },
        { href: `/admin/d/${domainId}/admins`, label: 'Admins', icon: TeamIcon },
      ],
    },
    {
      id: 'organizations',
      label: 'Organizations',
      icon: OrganizationsIcon,
      items: [
        { href: `/admin/d/${domainId}/organizations`, label: 'All Organizations', icon: OrganizationsIcon },
        { href: `/admin/d/${domainId}/organizations/create`, label: 'Create Organization', icon: OrganizationsIcon },
      ],
    },
    {
      id: 'authentication',
      label: 'Authentication',
      icon: IdentityIcon,
      items: [
        { href: `/admin/d/${domainId}/settings/sso`, label: 'SSO Configuration', icon: IdentityIcon },
        { href: `/admin/d/${domainId}/settings/oauth`, label: 'OAuth Providers', icon: IdentityIcon },
        { href: `/admin/d/${domainId}/settings/mfa`, label: 'MFA Settings', icon: CertificatesIcon },
      ],
    },
    {
      id: 'content',
      label: 'Content & Moderation',
      icon: ContentGroupIcon,
      items: [
        { href: `/admin/d/${domainId}/content`, label: 'Content Browser', icon: ContentIcon },
        { href: `/admin/d/${domainId}/moderation`, label: 'Moderation Queue', icon: ModerationIcon, badge: stats?.pendingReports, badgeColor: 'bg-red-500' },
        { href: `/admin/d/${domainId}/reports`, label: 'Reports', icon: ReportsIcon },
        { href: `/admin/d/${domainId}/appeals`, label: 'Appeals', icon: AppealsIcon },
        { href: `/admin/d/${domainId}/featured`, label: 'Featured', icon: FeaturedIcon },
        { href: `/admin/d/${domainId}/challenges`, label: 'Challenges', icon: ChallengesIcon },
        { href: `/admin/d/${domainId}/announcements`, label: 'Announcements', icon: AnnouncementsIcon },
      ],
    },
    {
      id: 'platform',
      label: 'Platform Services',
      icon: PlatformIcon,
      items: [
        { href: `/admin/d/${domainId}/analytics`, label: 'Analytics', icon: AnalyticsIcon },
        { href: `/admin/d/${domainId}/payments`, label: 'Payments', icon: PaymentsIcon },
        { href: `/admin/d/${domainId}/live`, label: 'Live Streams', icon: LiveIcon, badge: stats?.activeLiveStreams, badgeColor: 'bg-green-500' },
        { href: `/admin/d/${domainId}/render`, label: 'Render Pipeline', icon: RenderIcon },
      ],
    },
    {
      id: 'settings',
      label: 'Domain Settings',
      icon: SettingsIcon,
      items: [
        { href: `/admin/d/${domainId}/settings`, label: 'Overview', icon: SettingsIcon },
        { href: `/admin/d/${domainId}/settings/services`, label: 'Services', icon: PlatformIcon },
        { href: `/admin/d/${domainId}/settings/identity`, label: 'Identity (PLC)', icon: IdentityIcon },
        { href: `/admin/d/${domainId}/settings/certificates`, label: 'Certificates', icon: CertificatesIcon },
        { href: `/admin/d/${domainId}/settings/tokens`, label: 'API Tokens', icon: TokensIcon },
        { href: `/admin/d/${domainId}/settings/branding`, label: 'Branding', icon: FeaturedIcon },
        { href: `/admin/d/${domainId}/settings/federation`, label: 'Federation', icon: DomainsIcon },
      ],
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure',
      icon: InfraGroupIcon,
      items: [
        { href: `/admin/d/${domainId}/clusters`, label: 'Clusters', icon: InfrastructureIcon },
      ],
    },
    {
      id: 'system',
      label: 'System',
      icon: SystemIcon,
      items: [
        { href: `/admin/d/${domainId}/audit`, label: 'Audit Log', icon: AuditIcon },
        { href: `/admin/d/${domainId}/activity`, label: 'Activity Feed', icon: ActivityIcon },
      ],
    },
  ];
}

// Navigation configuration for global view
function getGlobalNavGroups(stats?: QuickStats): NavGroup[] {
  return [
    {
      id: 'domains',
      label: 'Domains',
      icon: DomainsIcon,
      items: [
        { href: '/admin/domains', label: 'All Domains', icon: DomainsIcon },
        { href: '/admin/domains?filter=unverified', label: 'Unverified Domains', icon: DomainsIcon },
        { href: '/admin/domains?filter=verified', label: 'Verified Domains', icon: DomainsIcon },
        { href: '/admin/domains?filter=pending', label: 'Pending Domains', icon: DomainsIcon },
        { href: '/admin/domains?filter=hosted', label: 'Hosted Domains', icon: DomainsIcon },
        { href: '/admin/domains?filter=federated', label: 'Federated Domains', icon: DomainsIcon },
      ],
    },
    {
      id: 'organizations',
      label: 'Organizations',
      icon: OrganizationsIcon,
      items: [
        { href: '/admin/organizations', label: 'All Organizations', icon: OrganizationsIcon },
      ],
    },
    {
      id: 'platform',
      label: 'Platform Services',
      icon: PlatformIcon,
      items: [
        { href: '/admin/payments', label: 'Payment Configurations', icon: PaymentsIcon },
        { href: '/admin/analytics', label: 'Analytics', icon: AnalyticsIcon },
        { href: '/admin/live', label: 'Live Streams', icon: LiveIcon, badge: stats?.activeLiveStreams, badgeColor: 'bg-green-500' },
        { href: '/admin/render', label: 'Render Pipeline', icon: RenderIcon },
      ],
    },
    {
      id: 'security',
      label: 'Security',
      icon: CertificatesIcon,
      items: [
        { href: '/admin/certificates', label: 'Certificates', icon: CertificatesIcon },
        { href: '/admin/authentication', label: 'Authentication', icon: IdentityIcon },
        { href: '/admin/tokens', label: 'API Tokens', icon: TokensIcon },
        { href: '/admin/certificates/ocsp', label: 'OCSP & CRL Management', icon: CertificatesIcon },
      ],
    },
    {
      id: 'cluster',
      label: 'Cluster',
      icon: InfraGroupIcon,
      items: [
        { href: '/admin/federation', label: 'Federation', icon: DomainsIcon },
        { href: '/admin/infrastructure', label: 'Clusters', icon: InfrastructureIcon },
        { href: '/admin/plc', label: 'PLC Directories', icon: IdentityIcon },
        { href: '/admin/exprsn-directories', label: 'Exprsn Directories', icon: DomainsIcon },
      ],
    },
    {
      id: 'system',
      label: 'System',
      icon: SystemIcon,
      items: [
        { href: '/admin/settings', label: 'System Settings', icon: SettingsIcon },
        { href: '/admin/audit', label: 'Audit Logs', icon: AuditIcon },
        { href: '/admin/activity', label: 'Activity', icon: ActivityIcon },
      ],
    },
  ];
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(getInitialExpandedState);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(getInitialSidebarCollapsed);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { selectedDomainId, isGlobal } = useAdminDomain();

  // Persist sidebar collapsed state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  // Poll quick stats every 30 seconds
  const { data: quickStats } = useQuery<QuickStats>({
    queryKey: ['admin', 'quickStats'],
    queryFn: () => api.getQuickStats(),
    refetchInterval: 30000,
    enabled: !!adminSession,
    staleTime: 15000,
  });

  // Persist expanded state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedGroups));
    }
  }, [expandedGroups]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  }, []);

  useEffect(() => {
    async function checkAdminAccess() {
      if (authLoading) return;

      const isDev = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      if (isDev) {
        api.setDevAdminMode(true);
      }

      if (!user && !isDev) {
        router.push('/login?redirect=/admin');
        return;
      }

      try {
        const session = await api.getAdminSession();
        setAdminSession(session);
        setIsLoading(false);
      } catch (err) {
        if (isDev && !user) {
          setError('Dev admin bypass not enabled. Set DEV_ADMIN_BYPASS=true in API .env');
        } else {
          setError('You do not have admin access');
        }
        setIsLoading(false);
      }
    }

    checkAdminAccess();
  }, [user, authLoading, router]);

  // Get navigation based on domain selection
  const navGroups = isGlobal || !selectedDomainId
    ? getGlobalNavGroups(quickStats)
    : getDomainNavGroups(selectedDomainId, quickStats);

  // Auto-expand group containing active route
  useEffect(() => {
    for (const group of navGroups) {
      const hasActiveItem = group.items.some(item =>
        item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
      );
      if (hasActiveItem && !expandedGroups.includes(group.id)) {
        setExpandedGroups(prev => [...prev, group.id]);
        break;
      }
    }
  }, [pathname, navGroups]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Access Denied</h1>
          <p className="text-text-muted mb-4">{error}</p>
          <Link href="/" className="text-accent hover:underline">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    // For domain-scoped routes, check exact path or sub-paths
    if (href.startsWith('/admin/d/')) {
      return pathname === href || pathname.startsWith(href + '/');
    }
    return pathname.startsWith(href);
  };

  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => isActive(item.href));
  };

  // Get dashboard link based on context
  const dashboardHref = isGlobal || !selectedDomainId ? '/admin' : `/admin/d/${selectedDomainId}`;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile menu backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border flex items-center px-4 z-30 lg:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <Link href="/admin" className="ml-3 flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-accent to-accent-hover rounded-lg flex items-center justify-center">
            <span className="text-text-inverse font-bold text-xs">E</span>
          </div>
          <span className="font-bold text-text-primary text-sm">Admin</span>
        </Link>
      </div>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen bg-surface border-r border-border flex flex-col z-50
          transition-all duration-200 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} w-64
        `}
      >
        {/* Logo + Toggle */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-hover rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-text-inverse font-bold text-sm">E</span>
            </div>
            {!isSidebarCollapsed && (
              <span className="font-bold text-text-primary">Admin Panel</span>
            )}
          </Link>
          <div className="flex items-center gap-1">
            {/* Mobile close button */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary lg:hidden"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
            {/* Desktop collapse toggle */}
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hidden lg:block"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <CollapseIcon className={`w-4 h-4 transition-transform duration-200 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Domain Selector */}
        {!isSidebarCollapsed && (
          <div className="p-3 border-b border-border">
            <DomainSelector />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {/* Dashboard - standalone */}
          <NavTooltip label="Dashboard" show={isSidebarCollapsed}>
            <Link
              href={dashboardHref}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-2 ${
                isSidebarCollapsed ? 'justify-center' : ''
              } ${
                pathname === dashboardHref || (pathname === '/admin' && isGlobal)
                  ? 'bg-accent text-text-inverse'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <DashboardIcon className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>Dashboard</span>}
            </Link>
          </NavTooltip>

          {/* Accordion Groups */}
          <div className="space-y-1">
            {navGroups.map((group) => {
              const isExpanded = expandedGroups.includes(group.id);
              const groupActive = isGroupActive(group);

              return (
                <div key={group.id}>
                  {/* Group Header */}
                  <NavTooltip label={group.label} show={isSidebarCollapsed}>
                    <button
                      onClick={() => !isSidebarCollapsed && toggleGroup(group.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isSidebarCollapsed ? 'justify-center' : ''
                      } ${
                        groupActive && !isExpanded
                          ? 'bg-accent/10 text-accent'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <group.icon className="w-5 h-5 flex-shrink-0" />
                      {!isSidebarCollapsed && (
                        <>
                          <span className="flex-1 text-left text-sm font-medium">{group.label}</span>
                          <ChevronIcon
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </>
                      )}
                    </button>
                  </NavTooltip>

                  {/* Group Items - only show when expanded and not collapsed */}
                  {!isSidebarCollapsed && (
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <ul className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                        {group.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-sm ${
                                isActive(item.href)
                                  ? 'bg-accent text-text-inverse'
                                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                              }`}
                            >
                              <item.icon className="w-4 h-4" />
                              <span className="flex-1">{item.label}</span>
                              {item.badge !== undefined && item.badge > 0 && (
                                <span
                                  className={`px-1.5 py-0.5 text-xs font-medium rounded-full text-white min-w-[18px] text-center ${
                                    item.badgeColor || 'bg-accent'
                                  }`}
                                >
                                  {item.badge > 99 ? '99+' : item.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Quick Stats Summary */}
        {quickStats && !isSidebarCollapsed && (
          <div className="px-3 py-2 border-t border-border">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-surface-hover">
                <p className="text-base font-bold text-text-primary">{quickStats.activeUsersNow}</p>
                <p className="text-xs text-text-muted">Online</p>
              </div>
              <div className="p-2 rounded-lg bg-surface-hover">
                <p className="text-base font-bold text-text-primary">{quickStats.newUsersToday}</p>
                <p className="text-xs text-text-muted">New</p>
              </div>
            </div>
          </div>
        )}

        {/* Collapsed stats indicator */}
        {quickStats && isSidebarCollapsed && (
          <div className="px-2 py-2 border-t border-border">
            <NavTooltip label={`${quickStats.activeUsersNow} online`} show={true}>
              <div className="p-2 rounded-lg bg-surface-hover text-center">
                <p className="text-sm font-bold text-text-primary">{quickStats.activeUsersNow}</p>
              </div>
            </NavTooltip>
          </div>
        )}

        {/* Admin info */}
        <div className="p-3 border-t border-border">
          <NavTooltip
            label={`${adminSession?.user?.displayName || adminSession?.user?.handle || 'Admin'} (${adminSession?.admin.role.replace('_', ' ')})`}
            show={isSidebarCollapsed}
          >
            <div className={`flex items-center gap-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                {adminSession?.user?.avatar ? (
                  <img
                    src={adminSession.user.avatar}
                    alt={adminSession.user.handle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold text-sm">
                    {adminSession?.user?.handle?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {adminSession?.user?.displayName || adminSession?.user?.handle}
                  </p>
                  <p className="text-xs text-text-muted capitalize">
                    {adminSession?.admin.role.replace('_', ' ')}
                  </p>
                </div>
              )}
            </div>
          </NavTooltip>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDomainProvider>
      <CommandPaletteProvider>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </CommandPaletteProvider>
    </AdminDomainProvider>
  );
}

// Group Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function UsersGroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ContentGroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25-3.75h7.5M3.375 12c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m7.5-3.75v1.5c0 .621.504 1.125 1.125 1.125m0 0h7.5m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5m7.5 0c.621 0 1.125.504 1.125 1.125v1.5" />
    </svg>
  );
}

function PlatformIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
    </svg>
  );
}

function InfraGroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function DomainsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function OrganizationsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function ChallengesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m3.044-1.35a6.726 6.726 0 01-2.748 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function AnalyticsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function FeaturedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function AuditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function AnnouncementsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
    </svg>
  );
}

function ModerationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function PaymentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function LiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      <circle cx="19" cy="5" r="3" fill="currentColor" className="text-red-500" />
    </svg>
  );
}

function CertificatesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function IdentityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
    </svg>
  );
}

function RenderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-2.625 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m14.25 0h1.5" />
    </svg>
  );
}

function InfrastructureIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AppealsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}

function TokensIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function RolesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
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

function CollapseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

// Tooltip wrapper for collapsed sidebar items
function NavTooltip({ children, label, show }: { children: React.ReactNode; label: string; show: boolean }) {
  if (!show) return <>{children}</>;

  return (
    <div className="relative group">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-surface-elevated border border-border rounded-md shadow-lg text-sm text-text-primary whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 pointer-events-none">
        {label}
      </div>
    </div>
  );
}
