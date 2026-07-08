'use client';

import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useRouter } from 'next/navigation';
import Reveal from '@/app/components/Reveal';
import { tokens } from '@/lib/theme';

export default function CTASection() {
  const router = useRouter();
  return (
    <Box sx={{ px: { xs: 3, md: 8 }, py: { xs: 8, md: 14 }, maxWidth: 1200, mx: 'auto' }}>
      <Reveal>
        <Box
          sx={{
            position: 'relative',
            borderRadius: `${tokens.radius + 8}px`,
            border: `1px solid ${tokens.hairline}`,
            overflow: 'hidden',
            px: { xs: 4, md: 10 },
            py: { xs: 8, md: 12 },
            textAlign: 'center',
            background:
              `radial-gradient(700px 340px at 50% -30%, ${tokens.accentDim}, transparent 70%), ${tokens.bgElevated}`,
          }}
        >
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' }, maxWidth: 640, mx: 'auto' }}>
            Protect your organization from the inside out.
          </Typography>
          <Typography sx={{ mt: 2.5, color: tokens.textDim, maxWidth: 520, mx: 'auto', fontSize: '1.05rem', lineHeight: 1.7 }}>
            Sign in to the console and start monitoring authenticated behaviour, scoring risk and
            triaging alerts in real time.
          </Typography>
          <Button
            onClick={() => router.push('/login')}
            endIcon={
              <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(5,7,13,0.18)' }}>
                <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
            }
            sx={{
              mt: 5, background: tokens.accentBright, color: '#05070d', fontWeight: 700, pl: 3, pr: 1, py: 1.4,
              '&:hover': { background: tokens.accent, transform: 'translateY(-1px)' },
            }}
          >
            Get started
          </Button>
        </Box>
      </Reveal>
    </Box>
  );
}
