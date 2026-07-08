'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import Reveal from '@/app/components/Reveal';
import { tokens, bezelShell, bezelCore } from '@/lib/theme';

const features = [
  { icon: <VerifiedUserOutlinedIcon />, title: 'Role-based access', body: 'Grant read, download or full control per user, role and department — and prove who can reach what.' },
  { icon: <NotificationsActiveOutlinedIcon />, title: 'Real-time alerts', body: 'Detections stream to the console the instant they fire, with severity and evidence attached.' },
  { icon: <AssessmentOutlinedIcon />, title: 'Risk scoring', body: 'Every user carries a rolling, time-decayed risk score so the riskiest people rise to the top.' },
  { icon: <MarkEmailReadOutlinedIcon />, title: 'OTP + email auth', body: 'Password plus single-use, rate-limited email OTP keeps compromised credentials from getting in.' },
];

export default function FeaturesSection() {
  return (
    <Box id="features" sx={{ py: { xs: 12, md: 20 }, px: { xs: 3, md: 8 }, maxWidth: 1200, mx: 'auto' }}>
      <Reveal>
        <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 2 }}>
          Capabilities
        </Typography>
        <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' }, maxWidth: 720 }}>
          Everything you need to watch the inside.
        </Typography>
      </Reveal>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2, mt: 6 }}>
        {features.map((f, i) => (
          <Reveal key={f.title} delay={i * 80}>
            <Box sx={{ ...bezelShell, height: '100%' }}>
              <Box sx={{ ...bezelCore, p: 3.5, height: '100%' }}>
                <Box
                  sx={{
                    width: 44, height: 44, borderRadius: '13px', display: 'grid', placeItems: 'center',
                    background: tokens.accentDim, border: `1px solid ${tokens.accent}33`, color: tokens.accent, mb: 2.5,
                  }}
                >
                  {f.icon}
                </Box>
                <Typography sx={{ fontWeight: 700, mb: 1, fontSize: 16 }}>{f.title}</Typography>
                <Typography sx={{ color: tokens.textDim, lineHeight: 1.6, fontSize: 14 }}>{f.body}</Typography>
              </Box>
            </Box>
          </Reveal>
        ))}
      </Box>
    </Box>
  );
}
