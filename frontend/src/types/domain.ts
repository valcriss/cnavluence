export type User = {
  id: string;
  email: string;
  displayName: string;
  siteRole: 'SITE_ADMIN' | 'SITE_USER';
};

export type Space = {
  id: string;
  key: string;
  name: string;
  description?: string;
  archivedAt?: string | null;
  isPersonal?: boolean;
  tag?: string | null;
  role: 'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER';
};

export type CollectionOwner = {
  id: string;
  email: string;
  displayName: string;
};

export type AdminCollection = {
  id: string;
  key: string;
  name: string;
  description: string;
  archivedAt: string | null;
  isPersonal: boolean;
  tag: string | null;
  personalOwnerUserId: string | null;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  owners: CollectionOwner[];
};

export type SettingsUser = {
  id: string;
  email: string;
  displayName: string;
  siteRole: 'SITE_ADMIN' | 'SITE_USER';
  createdAt: string;
};

export type Page = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  slug: string;
  archived: boolean;
  isTemplate: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SearchItem = {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  updatedAt: string;
  space: { id: string; key: string; name: string };
  canonicalUrl: string;
};

export type PageRestriction = {
  id: string;
  role: 'SPACE_ADMIN' | 'SPACE_EDITOR' | 'SPACE_VIEWER' | null;
  user: { id: string; email: string; displayName: string } | null;
};

export type PageRestrictions = {
  pageId: string;
  view: PageRestriction[];
  edit: PageRestriction[];
};

export type AuditActor = {
  id: string;
  email: string;
  displayName: string;
};

export type AuditPageRef = {
  id: string;
  title: string;
  slug: string;
};

export type AuditSpaceRef = {
  id: string;
  key: string;
  name: string;
};

export type AuditLogEntry = {
  id: string;
  at: string;
  actorUserId: string | null;
  spaceId: string | null;
  pageId: string | null;
  eventType: string;
  before: unknown;
  after: unknown;
  actor?: AuditActor | null;
  page?: AuditPageRef | null;
  space?: AuditSpaceRef | null;
};

export type BacklinkItem = {
  fromPage: {
    id: string;
    title: string;
    slug: string;
    canonicalUrl: string;
    space: {
      id: string;
      key: string;
      name: string;
    };
  };
  updatedAt: string;
};

export type TemplateItem = {
  id: string;
  title: string;
  slug: string;
  updatedAt: string;
  preview: string;
};
