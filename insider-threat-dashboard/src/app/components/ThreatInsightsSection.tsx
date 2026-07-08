'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import ReportGmailerrorredRoundedIcon from '@mui/icons-material/ReportGmailerrorredRounded';
import Reveal from '@/app/components/Reveal';
import { tokens, bezelShell, bezelCore } from '@/lib/theme';

const alerts = [
  'Suspicious login · 03:15 · 192.168.1.10',
  'Unauthorized access attempt · user: john_doe',
  'Unusual file activity · IT department',
  'Excessive downloads · finance share',
];

const stats = [
  { value: '450+', label: 'Threats monitored weekly', color: tokens.accentBright },
  { value: '25', label: 'High-priority incidents / day', color: tokens.severity.high },
  { value: '<60s', label: 'Detection-to-alert latency', color: tokens.severity.low },
];

export default function ThreatInsightsSection() {
  return (
    <Box id="threat-insights" sx={{ py: { xs: 12, md: 20 }, px: { xs: 3, md: 8 }, maxWidth: 1200, mx: 'auto' }}>
      <Reveal>
        <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 2 }}>
          Live signal
        </Typography>
        <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' }, maxWidth: 720 }}>
          Insight the moment it matters.
        </Typography>
      </Reveal>

      {/* Alert ticker */}
      <Reveal delay={80} sx={{ mt: 5 }}>
        <Box sx={{ ...bezelShell }}>
          <Box
            sx={{
              ...bezelCore, overflow: 'hidden', whiteSpace: 'nowrap', py: 1.5, position: 'relative',
              maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
            }}
          >
            <Box sx={{ display: 'inline-block', animation: 'ticker 32s linear infinite', '@keyframes ticker': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } } }}>
              {[...alerts, ...alerts].map((a, i) => (
                <Box key={i} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mx: 3, color: tokens.textDim, fontSize: 14 }}>
                  <ReportGmailerrorredRoundedIcon sx={{ fontSize: 16, color: tokens.severity.high }} />
                  {a}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Reveal>

      {/* Stat band */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mt: 3 }}>
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 90}>
            <Box sx={{ ...bezelShell, height: '100%' }}>
              <Box sx={{ ...bezelCore, p: 4, height: '100%' }}>
                <Typography sx={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: s.color, lineHeight: 1 }}>
                  {s.value}
                </Typography>
                <Typography sx={{ mt: 1, color: tokens.textDim, fontSize: 14 }}>{s.label}</Typography>
              </Box>
            </Box>
          </Reveal>
        ))}
      </Box>
    </Box>
  );
}
