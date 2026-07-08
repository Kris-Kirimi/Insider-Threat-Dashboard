'use client';

import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Tabs, Tab, TextField, Switch, FormControlLabel, Button,
  IconButton, InputAdornment, ThemeProvider, CssBaseline,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useRouter } from 'next/navigation';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import { getSessionUser } from '@/lib/auth';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

interface PasswordVisibility {
  current: boolean;
  new: boolean;
  confirm: boolean;
}

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    background: tokens.surface,
    '& fieldset': { borderColor: tokens.hairline },
    '&:hover fieldset': { borderColor: tokens.hairlineStrong },
    '&.Mui-focused fieldset': { borderColor: tokens.accent },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: tokens.accent },
};

const primaryBtn = {
  background: tokens.accentBright, color: '#05070d', fontWeight: 700,
  '&:hover': { background: tokens.accent },
};

export default function EmployeeSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [show, setShow] = useState<PasswordVisibility>({ current: false, new: false, confirm: false });
  const [profile, setProfile] = useState({ name: '', email: '' });

  useEffect(() => {
    const user = getSessionUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setProfile({ name: user.full_name || '', email: user.email });
  }, [router]);

  const toggle = (f: keyof PasswordVisibility) => setShow((p) => ({ ...p, [f]: !p[f] }));

  const pwField = (label: string, key: keyof PasswordVisibility) => (
    <TextField
      fullWidth label={label} type={show[key] ? 'text' : 'password'} sx={fieldSx}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={() => toggle(key)} edge="end" sx={{ color: tokens.textDim }}>
              {show[key] ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, display: 'flex', flexDirection: 'column' }}>
        <AuthedTopBar />
        <Box sx={{ flexGrow: 1, px: 3, py: { xs: 4, md: 6 }, maxWidth: 640, mx: 'auto', width: '100%' }}>
          <Box sx={{ animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
            <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 1.5 }}>
              Account
            </Typography>
            <Typography variant="h4" sx={{ mb: 3 }}>Settings</Typography>
          </Box>

          <Box sx={{ ...bezelShell, animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) 80ms both' }}>
            <Box sx={{ ...bezelCore, overflow: 'hidden' }}>
              <Tabs
                value={tab}
                onChange={(_e, v) => setTab(v)}
                variant="scrollable"
                allowScrollButtonsMobile
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
                <Tab label="Preferences" />
              </Tabs>

              <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                {tab === 0 && (
                  <Box sx={{ display: 'grid', gap: 2 }}>
                    <Typography variant="h6">Personal information</Typography>
                    <TextField fullWidth label="Full name" value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })} sx={fieldSx} />
                    <TextField fullWidth label="Email" type="email" value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })} sx={fieldSx} />
                    <Button sx={{ ...primaryBtn, mt: 1 }}>Save changes</Button>
                  </Box>
                )}

                {tab === 1 && (
                  <Box sx={{ display: 'grid', gap: 2 }}>
                    <Typography variant="h6">Password &amp; security</Typography>
                    {pwField('Current password', 'current')}
                    {pwField('New password', 'new')}
                    {pwField('Confirm new password', 'confirm')}
                    <Button sx={{ ...primaryBtn, mt: 1 }}>Update password</Button>
                  </Box>
                )}

                {tab === 2 && (
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>Notification preferences</Typography>
                    <FormControlLabel control={<Switch defaultChecked color="primary" />} label="Receive system alerts" />
                    <FormControlLabel control={<Switch color="primary" />} label="Receive activity reports" />
                    <FormControlLabel control={<Switch defaultChecked color="primary" />} label="Receive email notifications" />
                    <Button sx={{ ...primaryBtn, mt: 2 }}>Save preferences</Button>
                  </Box>
                )}

                {tab === 3 && (
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>General preferences</Typography>
                    <FormControlLabel control={<Switch defaultChecked color="primary" />} label="Show help tooltips" />
                    <FormControlLabel control={<Switch defaultChecked color="primary" />} label="Compact tables" />
                    <Button sx={{ ...primaryBtn, mt: 2 }}>Save preferences</Button>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
