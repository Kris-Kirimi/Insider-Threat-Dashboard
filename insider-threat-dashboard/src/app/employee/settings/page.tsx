'use client';

import React, { useEffect, useState } from 'react';
import { Box, Button, Tabs, Tab, ThemeProvider, Typography, CssBaseline } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useRouter } from 'next/navigation';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import {
  ProfilePanel, SecurityPanel, NotificationsPanel, DisplayPanel,
} from '@/app/components/SettingsPanels';
import { getSessionUser, routeForUser, SessionUser } from '@/lib/auth';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

export default function EmployeeSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const session = getSessionUser();
    if (!session) {
      router.replace('/login');
      return;
    }
    setUser(session);
  }, [router]);

  // Somewhere to go back to. Previously the only way out of this page was the
  // logo, which led to the public landing page rather than the workspace.
  const back = () => {
    const target = routeForUser(getSessionUser());
    if (window.history.length > 1) router.back();
    else router.push(target);
  };

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, display: 'flex', flexDirection: 'column' }}>
        <AuthedTopBar />
        <Box sx={{ flexGrow: 1, px: 3, py: { xs: 4, md: 6 }, maxWidth: 720, mx: 'auto', width: '100%' }}>
          <Button
            startIcon={<ArrowBackRoundedIcon />} onClick={back}
            sx={{ color: tokens.textDim, mb: 2, '&:hover': { color: tokens.text } }}
          >
            Back to workspace
          </Button>

          <Box sx={{ animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
            <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 1.5 }}>
              Account
            </Typography>
            <Typography variant="h4" sx={{ mb: 3 }}>Settings</Typography>
          </Box>

          <Box sx={{ ...bezelShell }}>
            <Box sx={{ ...bezelCore, overflow: 'hidden' }}>
              <Tabs
                value={tab} onChange={(_e, v) => setTab(v)}
                variant="scrollable" allowScrollButtonsMobile
                sx={{
                  px: 1, borderBottom: `1px solid ${tokens.hairline}`,
                  '& .MuiTab-root': { color: tokens.textDim, textTransform: 'none', minHeight: 52 },
                  '& .Mui-selected': { color: `${tokens.text} !important` },
                  '& .MuiTabs-indicator': { backgroundColor: tokens.accent },
                }}
              >
                <Tab label="Profile" />
                <Tab label="Security" />
                <Tab label="Notifications" />
                <Tab label="Display" />
              </Tabs>

              <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                {tab === 0 && <ProfilePanel user={user} />}
                {tab === 1 && <SecurityPanel />}
                {tab === 2 && <NotificationsPanel />}
                {tab === 3 && <DisplayPanel />}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
