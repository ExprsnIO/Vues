'use client';

import { ReactNode, useState, createContext, useContext } from 'react';

type TabsVariant = 'default' | 'pills' | 'underline';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tab components must be used within a Tabs component');
  }
  return context;
}

interface TabsProps {
  defaultTab: string;
  children: ReactNode;
  variant?: TabsVariant;
  onChange?: (tab: string) => void;
  className?: string;
}

export function Tabs({
  defaultTab,
  children,
  variant = 'default',
  onChange,
  className = '',
}: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    onChange?.(tab);
  };

  return (
    <TabsContext.Provider
      value={{ activeTab, setActiveTab: handleTabChange, variant }}
    >
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className = '' }: TabListProps) {
  const { variant } = useTabsContext();

  const variantStyles = {
    default: 'bg-surface-hover rounded-lg p-1 inline-flex gap-1',
    pills: 'inline-flex gap-2',
    underline: 'border-b border-border flex gap-4',
  }[variant];

  return (
    <div role="tablist" className={`${variantStyles} ${className}`}>
      {children}
    </div>
  );
}

interface TabProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
  badge?: string | number;
  icon?: ReactNode;
}

export function Tab({ id, children, disabled = false, badge, icon }: TabProps) {
  const { activeTab, setActiveTab, variant } = useTabsContext();
  const isActive = activeTab === id;

  const baseStyles =
    'inline-flex items-center gap-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50';

  const variantStyles = {
    default: `px-3 py-1.5 text-sm rounded-md ${
      isActive
        ? 'bg-surface text-text-primary shadow-sm'
        : 'text-text-muted hover:text-text-secondary'
    }`,
    pills: `px-4 py-2 text-sm rounded-full ${
      isActive
        ? 'bg-accent text-text-inverse'
        : 'bg-surface-hover text-text-muted hover:text-text-primary'
    }`,
    underline: `pb-3 text-sm border-b-2 -mb-px ${
      isActive
        ? 'border-accent text-accent'
        : 'border-transparent text-text-muted hover:text-text-primary hover:border-border'
    }`,
  }[variant];

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${id}`}
      id={`tab-${id}`}
      disabled={disabled}
      onClick={() => setActiveTab(id)}
      className={`${baseStyles} ${variantStyles} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {icon}
      {children}
      {badge !== undefined && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full ${
            isActive
              ? variant === 'pills'
                ? 'bg-white/20 text-white'
                : 'bg-accent/10 text-accent'
              : 'bg-surface-hover text-text-muted'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, children, className = '' }: TabPanelProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== id) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      className={className}
    >
      {children}
    </div>
  );
}

// Simple controlled tabs for basic use cases
interface SimpleTabsProps {
  tabs: Array<{
    id: string;
    label: string;
    badge?: string | number;
    icon?: ReactNode;
    disabled?: boolean;
  }>;
  activeTab: string;
  onChange: (tab: string) => void;
  variant?: TabsVariant;
  className?: string;
}

export function SimpleTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  className = '',
}: SimpleTabsProps) {
  const variantStyles = {
    default: 'bg-surface-hover rounded-lg p-1 inline-flex gap-1',
    pills: 'inline-flex gap-2',
    underline: 'border-b border-border flex gap-4',
  }[variant];

  const getTabStyles = (isActive: boolean) => {
    return {
      default: `px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
        isActive
          ? 'bg-surface text-text-primary shadow-sm'
          : 'text-text-muted hover:text-text-secondary'
      }`,
      pills: `px-4 py-2 text-sm rounded-full font-medium transition-colors ${
        isActive
          ? 'bg-accent text-text-inverse'
          : 'bg-surface-hover text-text-muted hover:text-text-primary'
      }`,
      underline: `pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
        isActive
          ? 'border-accent text-accent'
          : 'border-transparent text-text-muted hover:text-text-primary hover:border-border'
      }`,
    }[variant];
  };

  return (
    <div role="tablist" className={`${variantStyles} ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`${getTabStyles(activeTab === tab.id)} ${
            tab.disabled ? 'opacity-50 cursor-not-allowed' : ''
          } inline-flex items-center gap-2`}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? variant === 'pills'
                    ? 'bg-white/20 text-white'
                    : 'bg-accent/10 text-accent'
                  : 'bg-surface-hover text-text-muted'
              }`}
            >
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
