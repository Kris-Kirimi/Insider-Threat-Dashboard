'use client';

import React from 'react';
import { Box, Typography, Button, Stack, Chip } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useRouter } from 'next/navigation';
import { tokens } from '@/lib/theme';

const HeroSection = () => {
  const router = useRouter();
  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: { xs: '88dvh', md: '92dvh' },
        display: 'flex',
        alignItems: 'center',
        px: { xs: 3, md: 8 },
        pt: { xs: 12, md: 8 },
        overflow: 'hidden',
      }}
    >
      <Box sx={{ maxWidth: 820, position: 'relative', zIndex: 1 }}>
        <Box sx={{ animation: 'riseIn 700ms cubic-bezier(0.32,0.72,0,1) both' }}>
          <Chip
            icon={<ShieldOutlinedIcon sx={{ color: `${tokens.accentBright} !important`, fontSize: 16 }} />}
            label="Continuous insider-threat monitoring"
            sx={{
              mb: 3, color: '#cdefff', background: tokens.accentDim,
              border: `1px solid ${tokens.accent}44`, fontWeight: 500,
              textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 10, height: 30,
            }}
          />
        </Box>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '2.6rem', sm: '3.6rem', md: '4.6rem' },
            lineHeight: 1.04,
            animation: 'riseIn 700ms cubic-bezier(0.32,0.72,0,1) 80ms both',
          }}
        >
          See the threats that
          <br />
          come from <Box component="span" sx={{ color: tokens.accentBright }}>inside</Box>.
        </Typography>
        <Typography
          sx={{
            mt: 3, color: tokens.textDim, maxWidth: 600, fontSize: { xs: '1rem', md: '1.15rem' }, lineHeight: 1.7,
            animation: 'riseIn 700ms cubic-bezier(0.32,0.72,0,1) 160ms both',
          }}
        >
          InsiderDash watches authenticated users after login — auditing every action, scoring
          behavioural risk, and raising real-time alerts the moment activity turns suspicious.
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ mt: 5, animation: 'riseIn 700ms cubic-bezier(0.32,0.72,0,1) 240ms both' }}
        >
          <Button
            onClick={() => router.push('/login')}
            className="group"
            endIcon={
              <Box
                sx={{
                  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  background: 'rgba(5,7,13,0.18)', transition: 'transform 220ms cubic-bezier(0.32,0.72,0,1)',
                  '.MuiButton-root:hover &': { transform: 'translate(2px,-1px)' },
                }}
              >
                <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
            }
            sx={{
              background: tokens.accentBright, color: '#05070d', fontWeight: 700, pl: 3, pr: 1, py: 1.25,
              '&:hover': { background: tokens.accent, transform: 'translateY(-1px)' },
            }}
          >
            Sign in
          </Button>
          <Button
            onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
            sx={{
              color: tokens.text, px: 3, py: 1.25, border: `1px solid ${tokens.hairlineStrong}`,
              '&:hover': { borderColor: tokens.accent, color: tokens.accentBright },
            }}
          >
            Learn more
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default HeroSection;
