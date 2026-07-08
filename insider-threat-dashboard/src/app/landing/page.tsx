'use client';

import React from 'react';
import { Box, ThemeProvider, CssBaseline } from '@mui/material';
import TopNavBar from '@/app/components/TopNavBar';
import HeroSection from '@/app/components/HeroSection';
import AboutSection from '@/app/components/AboutSection';
import FeaturesSection from '@/app/components/FeaturesSection';
import ThreatInsightsSection from '@/app/components/ThreatInsightsSection';
import CTASection from '@/app/components/CTASection';
import FooterSection from '@/app/components/FooterSection';
import { appTheme, appBackground } from '@/lib/theme';

const LandingPage = () => {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, backgroundAttachment: 'fixed', color: 'text.primary' }}>
        <TopNavBar />
        <HeroSection />
        <AboutSection />
        <FeaturesSection />
        <ThreatInsightsSection />
        <CTASection />
        <FooterSection />
      </Box>
    </ThemeProvider>
  );
};

export default LandingPage;
