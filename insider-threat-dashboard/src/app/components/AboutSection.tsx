'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Reveal from '@/app/components/Reveal';
import { tokens, bezelShell, bezelCore } from '@/lib/theme';

const cards = [
  {
    icon: <ShieldOutlinedIcon />,
    title: 'Secure by design',
    body: 'Built security-first on Django REST and Next.js, with JWT + OTP authentication and role-based access on every resource.',
  },
  {
    icon: <InsightsRoundedIcon />,
    title: 'Real-time analytics',
    body: 'Behavioural detections and risk scores update live over WebSockets, so suspicious activity surfaces the moment it happens.',
  },
  {
    icon: <VisibilityOutlinedIcon />,
    title: 'Intelligent monitoring',
    body: 'Rule-based detectors and an Isolation Forest model watch authenticated users and flag anomalies before they escalate.',
  },
];

export default function AboutSection() {
  return (
    <Box id="about" sx={{ py: { xs: 12, md: 20 }, px: { xs: 3, md: 8 }, maxWidth: 1200, mx: 'auto' }}>
      <Reveal>
        <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 2 }}>
          What it does
        </Typography>
        <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' }, maxWidth: 720 }}>
          Threats from inside are the ones firewalls miss.
        </Typography>
        <Typography sx={{ mt: 2.5, color: tokens.textDim, maxWidth: 640, fontSize: '1.05rem', lineHeight: 1.7 }}>
          Insiders already hold valid credentials, so conventional perimeter defences never see them.
          InsiderDash provides continuous behavioural monitoring of everyone who is already logged in.
        </Typography>
      </Reveal>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mt: 6 }}>
        {cards.map((c, i) => (
          <Reveal key={c.title} delay={i * 90}>
            <Box sx={{ ...bezelShell, height: '100%' }}>
              <Box sx={{ ...bezelCore, p: 4, height: '100%' }}>
                <Box
                  sx={{
                    width: 46, height: 46, borderRadius: '13px', display: 'grid', placeItems: 'center',
                    background: tokens.accentDim, border: `1px solid ${tokens.accent}33`, color: tokens.accent, mb: 2.5,
                  }}
                >
                  {c.icon}
                </Box>
                <Typography variant="h6" sx={{ mb: 1 }}>{c.title}</Typography>
                <Typography sx={{ color: tokens.textDim, lineHeight: 1.65, fontSize: 14.5 }}>{c.body}</Typography>
              </Box>
            </Box>
          </Reveal>
        ))}
      </Box>
    </Box>
  );
}
