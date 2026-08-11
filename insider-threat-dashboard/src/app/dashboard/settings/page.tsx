'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Container, Tabs, Tab, ThemeProvider, Typography, CssBaseline,
} from '@mui/material';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import Sidebar from '../components/SideBar';
import FooterSection from '@/app/components/FooterSection';
import {
  ProfilePanel, SecurityPanel, NotificationsPanel, DisplayPanel,
} from '@/app/components/SettingsPanels';
import { getSessionUser, SessionUser } from '@/lib/auth';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

/**
 * Administrator settings. This route is linked from the console sidebar,
 * which previously pointed at a page that did not exist.
 *
 * The staff-only check lives in dashboard/layout.tsx, which every route under
 * /dashboard passes through.
 */
export default function DashboardSettingsPage() {
  const [tab, setTab] = useState(0);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => setUser(getSessionUser()), []);

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, display: 'flex', flexDirection: 'column' }}>
        <AuthedTopBar />
        <Box sx={{ display: 'flex', flex: 1 }}>
          <Sidebar />
          <Container maxWidth={false} sx={{ flex: 1, p: { xs: 2, sm: 4 }, ml: { xs: 0, md: '240px' }, maxWidth: 900 }}>
            <Box sx={{ animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
              <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 1.5 }}>
                Administrator
              </Typography>
              <Typography variant="h4">Settings</Typography>
              <Typography sx={{ mt: 1, color: tokens.textDim, maxWidth: 620 }}>
                Your own account and console preferences. To manage other people's
                accounts, use the Users page.
              </Typography>
            </Box>

            <Box sx={{ ...bezelShell, mt: 4 }}>
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

            <FooterSection />
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
