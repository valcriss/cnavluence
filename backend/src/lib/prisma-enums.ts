export const SpaceRole = {
  SPACE_VIEWER: 'SPACE_VIEWER',
  SPACE_EDITOR: 'SPACE_EDITOR',
  SPACE_ADMIN: 'SPACE_ADMIN',
} as const;

export type SpaceRoleValue = (typeof SpaceRole)[keyof typeof SpaceRole];

export const RestrictionType = {
  VIEW: 'VIEW',
  EDIT: 'EDIT',
} as const;

export type RestrictionTypeValue = (typeof RestrictionType)[keyof typeof RestrictionType];

export const VersionReason = {
  AUTO_TIMER: 'AUTO_TIMER',
  AUTO_SESSION_END: 'AUTO_SESSION_END',
  MANUAL: 'MANUAL',
  RESTORE: 'RESTORE',
} as const;

export type VersionReasonValue = (typeof VersionReason)[keyof typeof VersionReason];