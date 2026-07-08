'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, ThemeProvider, CssBaseline } from '@mui/material';
import AttachMoneyRoundedIcon from '@mui/icons-material/AttachMoneyRounded';
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useRouter } from 'next/navigation';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import { getSessionUser, routeForUser } from '@/lib/auth';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

const departments = [
  { name: 'Finance Department', route: '/employee/finance/dashboard', icon: <AttachMoneyRoundedIcon />, accent: tokens.accent },
  { name: 'IT Department', route: '/employee/it/dashboard', icon: <ComputerRoundedIcon />, accent: '#7c5cff' },
];

export default function EmployeeLandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getSessionUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    // Route users straight to their own department when we can infer it.
    const dest = routeForUser(user);
    if (dest !== '/employee') {
      router.replace(dest);
      return;
    }
    setReady(true);
  }, [router]);

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, display: 'flex', flexDirection: 'column' }}>
        <AuthedTopBar />
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3, py: 8 }}>
          {ready && (
            <Box sx={{ width: '100%', maxWidth: 760, animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
              <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 2, textAlign: 'center' }}>
                Workspace
              </Typography>
              <Typography variant="h3" sx={{ textAlign: 'center', fontSize: { xs: '2rem', md: '2.6rem' } }}>
                Select your department
              </Typography>
              <Typography sx={{ mt: 1.5, textAlign: 'center', color: tokens.textDim, maxWidth: 460, mx: 'auto' }}>
                Open the shared files for your team. Access is enforced per role — you only see what you're permitted to.
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 5 }}>
                {departments.map((d, i) => (
                  <Box
                    key={d.name}
                    onClick={() => router.push(d.route)}
                    sx={{
                      ...bezelShell, cursor: 'pointer',
                      transition: 'transform 220ms cubic-bezier(0.32,0.72,0,1), border-color 220ms',
                      animation: `riseIn 600ms cubic-bezier(0.32,0.72,0,1) ${i * 90 + 80}ms both`,
                      '&:hover': { transform: 'translateY(-4px)', borderColor: `${d.accent}55` },
                    }}
                  >
                    <Box sx={{ ...bezelCore, p: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box
                          sx={{
                            width: 52, height: 52, borderRadius: '15px', display: 'grid', placeItems: 'center',
                            background: `${d.accent}1f`, border: `1px solid ${d.accent}44`, color: d.accent,
                          }}
                        >
                          {d.icon}
                        </Box>
                        <ArrowForwardRoundedIcon sx={{ color: tokens.textFaint }} />
                      </Box>
                      <Box>
                        <Typography variant="h6">{d.name}</Typography>
                        <Typography sx={{ color: tokens.textDim, fontSize: 14, mt: 0.5 }}>
                          Browse and download shared files
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
