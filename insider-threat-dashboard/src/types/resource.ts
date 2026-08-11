// types/resource.ts
export type AccessLevel =
  | 'none'
  | 'read'
  | 'download'
  | 'upload'
  | 'write'
  | 'delete'
  | 'full_control';

/** Mirrors PERM_PRIORITY in insider-backend/users/permissions.py.
 *  Keep the two in step: the UI decides which buttons to show from this, and
 *  the API decides what to allow from its copy. */
export const PERM_PRIORITY: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  download: 2,
  upload: 3,
  write: 4,
  delete: 5,
  full_control: 100,
};

/** True when `access` covers `action`. Replaces the hand-written lists that
 *  drifted from the backend (one of them omitted 'upload', so an
 *  upload-holder saw a padlock on a file the API would have served). */
export function can(access: AccessLevel | undefined, action: AccessLevel): boolean {
  return (PERM_PRIORITY[access ?? 'none'] ?? 0) >= (PERM_PRIORITY[action] ?? 0);
}

export const ACCESS_LEVELS: AccessLevel[] = [
  'none', 'read', 'download', 'upload', 'write', 'delete', 'full_control',
];

/** Human labels for the permission dropdowns. */
export const ACCESS_LABELS: Record<AccessLevel, string> = {
  none: 'No access',
  read: 'Read only',
  download: 'Read & download',
  upload: 'Upload',
  write: 'Read, download & write',
  delete: 'Read, write & delete',
  full_control: 'Full control (all permissions)',
};

export interface ResourceDto {
  id: number;
  name: string;
  path: string;
  is_folder: boolean;
  department: string;
  created_by: string | null;
  created_at: string;
  access_for_current_user: AccessLevel;
}
