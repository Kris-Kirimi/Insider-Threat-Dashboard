// lib/auth.ts — session helpers and post-login routing.

export interface SessionUser {
  id: number;
  email: string;
  full_name: string;
  department: string | null;
  role: number | null;
  role_name: string | null;
  role_level: number | null;
  is_staff: boolean;
}

/** Where a user's Settings page lives. */
export function settingsRouteFor(user: SessionUser | null): string {
  return user?.is_staff ? '/dashboard/settings' : '/employee/settings';
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

/**
 * Where a user lands after login. There is deliberately a single login
 * entrance: the server decides who is an admin, so the UI never advertises
 * which accounts are privileged.
 */
export function routeForUser(user: SessionUser | null): string {
  if (!user) return '/login';
  if (user.is_staff) return '/dashboard';
  const dept = (user.department || '').toLowerCase();
  if (dept.includes('finance')) return '/employee/finance/dashboard';
  if (dept === 'it' || dept.includes('it department') || dept.includes('information technology')) {
    return '/employee/it/dashboard';
  }
  // Employees without a recognised department get the generic picker.
  return '/employee';
}
