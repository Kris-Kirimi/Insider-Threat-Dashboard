'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@mui/material';
import { apiGet } from '@/lib/api';
import { routeForUser, SessionUser } from '@/lib/auth';

/**
 * Guards every /dashboard/* route.
 *
 * The check asks the server who you are rather than trusting the cached user
 * in localStorage, which anyone can edit. This is only the cosmetic half:
 * the admin APIs (audit logs, alerts, risk scores) independently reject
 * non-staff with 403, and every such denial is recorded as an
 * `unauthorized_access` audit event.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed'>('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await apiGet<SessionUser>('/users/me/');
        if (cancelled) return;

        // Keep the cached copy in step with the server's answer.
        localStorage.setItem('user', JSON.stringify(me));

        if (me?.is_staff) {
          setState('allowed');
        } else {
          router.replace(routeForUser(me));
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  if (state === 'checking') {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: '#05070d',
        }}
      >
        <CircularProgress sx={{ color: '#5eead4' }} />
        <Typography sx={{ color: '#64748b', letterSpacing: '0.08em', fontSize: 13 }}>
          Verifying access…
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
}
