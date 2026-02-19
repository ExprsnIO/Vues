'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { SettingsPanel } from './SettingsPanel';

const NAV_ITEMS = [
  { href: '/', label: 'For You', icon: HomeIcon },
  { href: '/following', label: 'Following', icon: FollowingIcon },
  { href: '/discover', label: 'Discover', icon: DiscoverIcon },
];

// Context for sidebar state
const SidebarContext = createContext<{
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
  settingsOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggle = () => setIsOpen(!isOpen);
  const close = () => setIsOpen(false);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  // Close sidebar on route change
  const pathname = usePathname();
  useEffect(() => {
    setIsOpen(false);
    setSettingsOpen(false);
  }, [pathname]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen || settingsOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, settingsOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, settingsOpen, openSettings, closeSettings }}>
      {children}
      <SettingsPanel isOpen={settingsOpen} onClose={closeSettings} />
    </SidebarContext.Provider>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const { isOpen, close, openSettings } = useSidebar();

  // Fetch unread notification count
  const { data: notificationData } = useQuery({
    queryKey: ['unread-notifications'],
    queryFn: () => api.getUnreadNotificationCount(),
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch unread message count from conversations
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations({ limit: 50 }),
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unreadCount = notificationData?.count || 0;
  const unreadMessageCount = conversationsData?.conversations?.reduce(
    (sum, c) => sum + (c.unreadCount || 0),
    0
  ) || 0;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-60 bg-background-alt border-r border-border flex flex-col z-50',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-hover rounded-lg flex items-center justify-center">
              <span className="text-text-inverse font-bold text-lg">E</span>
            </div>
            <span className="text-xl font-bold text-text-primary">exprsn</span>
          </Link>
          {/* Close button on mobile */}
          <button
            onClick={close}
            className="lg:hidden p-2 text-text-muted hover:text-text-primary"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-surface text-text-primary'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                )}
              >
                <Icon className="w-6 h-6" filled={isActive} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* Upload button */}
          <Link
            href="/upload"
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 transition-colors mt-4"
          >
            <PlusIcon className="w-6 h-6" />
            <span className="font-medium">Upload</span>
          </Link>

          {/* Editor/Studio (only show when logged in) */}
          {user && (
            <Link
              href="/editor"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mt-2',
                pathname === '/editor'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              <StudioIcon className="w-6 h-6" filled={pathname === '/editor'} />
              <span className="font-medium">Studio</span>
            </Link>
          )}

          {/* Notifications (only show when logged in) */}
          {user && (
            <Link
              href="/notifications"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mt-2',
                pathname === '/notifications'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              <div className="relative">
                <NotificationIcon className="w-6 h-6" filled={pathname === '/notifications'} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent text-text-inverse text-xs font-bold rounded-full flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="font-medium">Notifications</span>
            </Link>
          )}

          {/* Messages (only show when logged in) */}
          {user && (
            <Link
              href="/messages"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                pathname.startsWith('/messages')
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              <div className="relative">
                <MessagesIcon className="w-6 h-6" filled={pathname.startsWith('/messages')} />
                {unreadMessageCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent text-text-inverse text-xs font-bold rounded-full flex items-center justify-center px-1">
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                  </span>
                )}
              </div>
              <span className="font-medium">Messages</span>
            </Link>
          )}

          {/* Bookmarks (only show when logged in) */}
          {user && (
            <Link
              href="/bookmarks"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                pathname === '/bookmarks'
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              <BookmarkIcon className="w-6 h-6" filled={pathname === '/bookmarks'} />
              <span className="font-medium">Bookmarks</span>
            </Link>
          )}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border">
          {isLoading ? (
            <div className="h-10 bg-surface rounded-lg animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <Link href={`/profile/${user.handle}`} className="w-10 h-10 rounded-full bg-surface flex items-center justify-center hover:ring-2 hover:ring-accent transition-all">
                <span className="text-text-primary font-medium">
                  {user.handle[0]?.toUpperCase()}
                </span>
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${user.handle}`} className="text-text-primary text-sm font-medium truncate block hover:underline">
                  @{user.handle}
                </Link>
              </div>
              <button
                onClick={openSettings}
                className="text-text-muted hover:text-text-primary p-2"
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => signOut()}
                className="text-text-muted hover:text-text-primary p-2"
                title="Sign out"
              >
                <LogoutIcon className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full text-center py-2.5 bg-surface hover:bg-surface-hover text-text-primary rounded-lg font-medium transition-colors"
            >
              Log in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

// Mobile header with hamburger menu
export function MobileHeader() {
  const { toggle } = useSidebar();

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-background-alt border-b border-border z-30 flex items-center px-4">
      <button
        onClick={toggle}
        className="p-2 -ml-2 text-text-muted hover:text-text-primary"
        aria-label="Open menu"
      >
        <MenuIcon className="w-6 h-6" />
      </button>
      <Link href="/" className="flex items-center gap-2 ml-2">
        <div className="w-7 h-7 bg-gradient-to-br from-accent to-accent-hover rounded-lg flex items-center justify-center">
          <span className="text-text-inverse font-bold text-sm">E</span>
        </div>
        <span className="text-lg font-bold text-text-primary">exprsn</span>
      </Link>
    </header>
  );
}

// Bottom navigation for mobile
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-background-alt border-t border-border z-30 flex items-center justify-around px-2">
      {NAV_ITEMS.slice(0, 4).map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(item.href));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-1 p-2',
              isActive ? 'text-text-primary' : 'text-text-muted'
            )}
          >
            <Icon className="w-6 h-6" filled={isActive} />
            <span className="text-xs">{item.label}</span>
          </Link>
        );
      })}
      <Link
        href="/upload"
        className="flex flex-col items-center gap-1 p-2 text-accent"
      >
        <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
          <PlusIcon className="w-5 h-5 text-white" />
        </div>
      </Link>
    </nav>
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

function HomeIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function FollowingIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function DiscoverIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
      />
    </svg>
  );
}

function NotificationIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function BookmarkIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function MessagesIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
      />
    </svg>
  );
}

function StudioIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m14.25 0h1.5"
      />
    </svg>
  );
}

