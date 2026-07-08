// types/resource.ts
export type AccessLevel =
  | 'none'
  | 'read'
  | 'download'
  | 'upload'
  | 'write'
  | 'delete'
  | 'full_control';

export interface ResourceDto {
  id: number;
  name: string;
  path: string;
  is_folder: boolean;
  department: number | string;
  created_by: string | null;
  created_at: string;
  access_for_current_user: AccessLevel;
}
