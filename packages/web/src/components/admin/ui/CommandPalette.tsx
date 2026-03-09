'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
  keywords?: string[];
  section?: string;
}

interface CommandPaletteProps {
  items: CommandItem[];
  placeholder?: string;
}

export function CommandPalette({
  items,
  placeholder = 'Search commands...',
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;

    const query = search.toLowerCase();
    return items.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(query);
      const matchDescription = item.description?.toLowerCase().includes(query);
      const matchKeywords = item.keywords?.some((k) =>
        k.toLowerCase().includes(query)
      );
      return matchLabel || matchDescription || matchKeywords;
    });
  }, [items, search]);

  // Group items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredItems.forEach((item) => {
      const section = item.section || 'Commands';
      if (!groups[section]) groups[section] = [];
      groups[section].push(item);
    });
    return groups;
  }, [filteredItems]);

  // Flatten grouped items for keyboard navigation
  const flatItems = useMemo(
    () => Object.values(groupedItems).flat(),
    [groupedItems]
  );

  // Open/close handlers
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setSearch('');
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      handleClose();
      item.action();
    },
    [handleClose]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          handleClose();
        } else {
          handleOpen();
        }
        return;
      }

      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            handleSelect(flatItems[selectedIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatItems, selectedIndex, handleOpen, handleClose, handleSelect]);

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isOpen]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg
            className="w-5 h-5 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-text-muted bg-surface-hover rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {flatItems.length === 0 ? (
            <div className="py-8 text-center text-text-muted">
              No commands found
            </div>
          ) : (
            Object.entries(groupedItems).map(([section, sectionItems]) => (
              <div key={section} className="mb-2 last:mb-0">
                <div className="px-2 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                  {section}
                </div>
                {sectionItems.map((item) => {
                  const index = flatItems.indexOf(item);
                  const isSelected = index === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      data-index={index}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
                        transition-colors
                        ${
                          isSelected
                            ? 'bg-accent text-text-inverse'
                            : 'text-text-primary hover:bg-surface-hover'
                        }
                      `}
                    >
                      {item.icon && (
                        <span
                          className={`flex-shrink-0 ${
                            isSelected ? 'text-text-inverse' : 'text-text-muted'
                          }`}
                        >
                          {item.icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.label}</div>
                        {item.description && (
                          <div
                            className={`text-sm truncate ${
                              isSelected
                                ? 'text-text-inverse/70'
                                : 'text-text-muted'
                            }`}
                          >
                            {item.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-hover rounded border border-border">
                ↵
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-hover rounded border border-border">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-surface-hover rounded border border-border">
                ↓
              </kbd>
              navigate
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded border border-border">
              ⌘K
            </kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}

// Hook to build common admin commands
export function useAdminCommands(): CommandItem[] {
  const router = useRouter();

  return useMemo(
    () => [
      // Navigation
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        description: 'View admin dashboard',
        section: 'Navigation',
        keywords: ['home', 'main'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        ),
        action: () => router.push('/admin'),
      },
      {
        id: 'nav-users',
        label: 'Go to Users',
        description: 'Manage all users',
        section: 'Navigation',
        keywords: ['accounts', 'members'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ),
        action: () => router.push('/admin/users'),
      },
      {
        id: 'nav-domains',
        label: 'Go to Domains',
        description: 'Manage domains',
        section: 'Navigation',
        keywords: ['sites', 'instances'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
        ),
        action: () => router.push('/admin/domains'),
      },
      {
        id: 'nav-reports',
        label: 'Go to Reports',
        description: 'View reports and moderation',
        section: 'Navigation',
        keywords: ['moderation', 'flags'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
            />
          </svg>
        ),
        action: () => router.push('/admin/reports'),
      },
      {
        id: 'nav-analytics',
        label: 'Go to Analytics',
        description: 'View platform analytics',
        section: 'Navigation',
        keywords: ['stats', 'metrics'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        ),
        action: () => router.push('/admin/analytics'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        description: 'Platform settings',
        section: 'Navigation',
        keywords: ['config', 'options'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        ),
        action: () => router.push('/admin/settings'),
      },
      // Actions
      {
        id: 'action-create-domain',
        label: 'Create New Domain',
        description: 'Add a new domain',
        section: 'Actions',
        keywords: ['add', 'new'],
        icon: (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        ),
        action: () => router.push('/admin/domains/new'),
      },
    ],
    [router]
  );
}

// Global command palette provider
interface CommandPaletteProviderProps {
  children: React.ReactNode;
  additionalCommands?: CommandItem[];
}

export function CommandPaletteProvider({
  children,
  additionalCommands = [],
}: CommandPaletteProviderProps) {
  const defaultCommands = useAdminCommands();
  const allCommands = useMemo(
    () => [...defaultCommands, ...additionalCommands],
    [defaultCommands, additionalCommands]
  );

  return (
    <>
      {children}
      <CommandPalette items={allCommands} />
    </>
  );
}
