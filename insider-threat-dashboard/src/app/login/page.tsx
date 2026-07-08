'use client';

import React from 'react';
import { Box, ThemeProvider, CssBaseline } from '@mui/material';
import LoginForm from '@/app/components/LoginForm';
import TopNavBar from '@/app/components/TopNavBar';
import FooterSection from '@/app/components/FooterSection';
import { appTheme, appBackground } from '@/lib/theme';

const LoginPage = () => {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, display: 'flex', flexDirection: 'column' }}>
        <TopNavBar />
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
          <LoginForm />
        </Box>
        <FooterSection />
      </Box>
    </ThemeProvider>
  );
};

export default LoginPage;
