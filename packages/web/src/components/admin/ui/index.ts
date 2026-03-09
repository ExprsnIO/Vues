// Admin UI Component Library
// Unified components for the admin interface

// Badges and Status
export { Badge, StatusBadge, RoleBadge } from './Badge';
export {
  StatusIndicator,
  HealthIndicator,
  ConnectionStatus,
} from './StatusIndicator';

// Data Display
export { StatCard, MiniStat, StatsGrid } from './StatCard';
export {
  DataTable,
  SimpleTable,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  type Column,
  type SortDirection,
} from './DataTable';

// Navigation
export { Tabs, TabList, Tab, TabPanel, SimpleTabs } from './Tabs';
export { Breadcrumbs, buildAdminBreadcrumbs, type BreadcrumbItem } from './Breadcrumbs';
export { PageHeader, SectionHeader, CardHeader } from './PageHeader';

// Modals and Dialogs
export { Modal, ModalBody, ModalFooter } from './Modal';
export { ConfirmDialog, DeleteConfirmDialog } from './ConfirmDialog';
export {
  CommandPalette,
  CommandPaletteProvider,
  useAdminCommands,
} from './CommandPalette';

// Forms
export {
  FormField,
  Input,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  Toggle,
} from './FormField';
export { SearchInput, SearchWithShortcut } from './SearchInput';
export { FilterDropdown, SelectDropdown } from './FilterDropdown';
export { DateRangePicker } from './DateRangePicker';

// Actions
export { ActionMenu, RowActionMenu } from './ActionMenu';

// Loading and Empty States
export {
  Skeleton,
  TextSkeleton,
  AvatarSkeleton,
  CardSkeleton,
  TableRowSkeleton,
  TableSkeleton,
  StatCardSkeleton,
  StatsGridSkeleton,
  ListSkeleton,
  PageSkeleton,
} from './LoadingSkeleton';
export {
  EmptyState,
  NoResultsState,
  NoDataState,
  ErrorState,
} from './EmptyState';
