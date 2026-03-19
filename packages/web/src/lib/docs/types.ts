export type DocsVisibility = 'public' | 'admin';

export type DocsStatus = 'available' | 'mvp' | 'planned';

export type DocsAudience =
  | 'all users'
  | 'members and creators'
  | 'moderators and admins'
  | 'platform admins'
  | 'operators and backend admins'
  | 'creators';

export interface DocsTocItem {
  id: string;
  label: string;
}

interface DocsBlockBase {
  id?: string;
  title?: string;
}

export interface DocsLeadBlock extends DocsBlockBase {
  type: 'lead';
  body: string[];
}

export interface DocsCalloutBlock extends DocsBlockBase {
  type: 'callout';
  tone: 'info' | 'success' | 'warning' | 'neutral';
  body: string[];
}

export interface DocsChecklistBlock extends DocsBlockBase {
  type: 'checklist';
  items: string[];
}

export interface DocsStepsBlock extends DocsBlockBase {
  type: 'steps';
  items: Array<{
    title: string;
    body: string;
  }>;
}

export interface DocsDefinitionListBlock extends DocsBlockBase {
  type: 'definition-list';
  items: Array<{
    term: string;
    definition: string;
  }>;
}

export interface DocsTableBlock extends DocsBlockBase {
  type: 'table';
  columns: string[];
  rows: string[][];
}

export interface DocsLinkGridBlock extends DocsBlockBase {
  type: 'link-grid';
  links: Array<{
    href: string;
    label: string;
    description: string;
  }>;
}

export interface DocsSectionDividerBlock extends DocsBlockBase {
  type: 'section-divider';
  id: string;
  body?: string[];
}

export type DocsBlock =
  | DocsLeadBlock
  | DocsCalloutBlock
  | DocsChecklistBlock
  | DocsStepsBlock
  | DocsDefinitionListBlock
  | DocsTableBlock
  | DocsLinkGridBlock
  | DocsSectionDividerBlock;

export interface DocsSection {
  id: string;
  slug:
    | 'setup'
    | 'administration'
    | 'user-experience'
    | 'moderation'
    | 'backend'
    | 'changelog'
    | 'identity'
    | 'messaging'
    | 'creator-tools';
  title: string;
  summary: string;
  visibility: DocsVisibility;
  audience: DocsAudience;
  status: DocsStatus;
  toc: DocsTocItem[];
  blocks: DocsBlock[];
  sourcePaths: string[];
}

export interface DocsAuthState {
  isAuthenticated: boolean;
}

export interface DocsAdminState {
  isAdmin: boolean;
}
