'use client';

import React from 'react';
import { Box, Typography, Link, Stack } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { tokens } from '@/lib/theme';

export default function FooterSection() {
  return (
    <Box component="footer" sx={{ borderTop: `1px solid ${tokens.hairline}`, px: { xs: 3, md: 8 }, py: 6 }}>
      <Box
        sx={{
          maxWidth: 1200, mx: 'auto', display: 'flex', flexWrap: 'wrap', gap: 3,
          alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 28, height: 28, borderRadius: '9px', display: 'grid', placeItems: 'center', background: `linear-gradient(140deg, ${tokens.accent}, #6366f1)` }}>
            <ShieldOutlinedIcon sx={{ fontSize: 16, color: '#05070d' }} />
          </Box>
          <Typography sx={{ fontWeight: 700 }}>InsiderDash</Typography>
        </Box>

        <Stack direction="row" spacing={3} sx={{ fontSize: 14 }}>
          {['Privacy', 'Terms', 'Contact'].map((l) => (
            <Link key={l} href="#" underline="none" sx={{ color: tokens.textDim, '&:hover': { color: tokens.text } }}>
              {l}
            </Link>
          ))}
        </Stack>

        <Typography sx={{ color: tokens.textFaint, fontSize: 13, width: { xs: '100%', md: 'auto' } }}>
          © {new Date().getFullYear()} InsiderDash — Insider Threat Monitoring
        </Typography>
      </Box>
    </Box>
  );
}
