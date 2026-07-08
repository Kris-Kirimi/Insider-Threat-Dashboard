'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@mui/material';
import { getSessionUser, routeForUser } from '@/lib/auth';

/**
 * Guards every /dashboard/* route. The admin console is staff-only: an
 * ordinary employee who navigates here directly is bounced to their own
 * department view, and a signed-out visitor is sent to login. This is the
 * client-side half of the check — the API also rejects non-staff on the
 * admin endpoints (audit logs, alerts, risk scores) with 403.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed'>('checking');

  useEffect(() => {
    const user = getSessionUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!user.is_staff) {
      router.replace(routeForUser(user));
      return;
    }
    setState('allowed');
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
