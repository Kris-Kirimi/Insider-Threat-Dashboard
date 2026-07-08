'use client';

import React, { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton, Stack } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useRouter } from 'next/navigation';
import { tokens } from '@/lib/theme';

// A single login entrance for everyone: the server decides whether the account
// is an admin or an employee, so the UI never advertises a privileged door.
const links = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/#about' },
  { label: 'Features', href: '/#features' },
];

export default function TopNavBar() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    if (href.startsWith('/#')) {
      const id = href.slice(2);
      if (window.location.pathname === '/') {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    router.push(href);
  };

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'center',
        px: 2,
        pt: { xs: 1.5, md: 2 },
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 980,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, md: 2 },
          py: 1,
          borderRadius: 999,
          border: `1px solid ${scrolled ? tokens.hairlineStrong : tokens.hairline}`,
          background: scrolled ? 'rgba(8,11,18,0.72)' : 'rgba(12,16,26,0.4)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          transition: 'all 400ms cubic-bezier(0.32,0.72,0,1)',
          boxShadow: scrolled ? '0 10px 40px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1.1, cursor: 'pointer', pl: 1 }}
          onClick={() => go('/')}
        >
          <Box
            sx={{
              width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center',
              background: `linear-gradient(140deg, ${tokens.accent}, #6366f1)`,
            }}
          >
            <ShieldOutlinedIcon sx={{ fontSize: 17, color: '#05070d' }} />
          </Box>
          <Box sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: 17 }}>InsiderDash</Box>
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
          {links.map((l) => (
            <Button
              key={l.label}
              onClick={() => go(l.href)}
              sx={{ color: tokens.textDim, px: 1.75, '&:hover': { color: tokens.text, background: 'transparent' } }}
            >
              {l.label}
            </Button>
          ))}
          <Button
            onClick={() => go('/login')}
            sx={{
              ml: 1, color: '#05070d', fontWeight: 700, px: 2.5, py: 0.9,
              background: tokens.accentBright,
              '&:hover': { background: tokens.accent, transform: 'translateY(-1px)' },
            }}
          >
            Sign in
          </Button>
        </Stack>

        {/* Mobile toggle */}
        <IconButton
          onClick={() => setOpen((o) => !o)}
          sx={{ display: { xs: 'inline-flex', md: 'none' }, color: tokens.text, width: 40, height: 40, position: 'relative' }}
          aria-label="menu"
        >
          <Box sx={{ position: 'relative', width: 20, height: 14 }}>
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  position: 'absolute', left: 0, width: 20, height: 2, borderRadius: 2, background: tokens.text,
                  transition: 'all 300ms cubic-bezier(0.32,0.72,0,1)',
                  top: open ? 6 : i * 6,
                  transform: open ? (i === 0 ? 'rotate(45deg)' : i === 2 ? 'rotate(-45deg)' : 'scaleX(0)') : 'none',
                  opacity: open && i === 1 ? 0 : 1,
                }}
              />
            ))}
          </Box>
        </IconButton>
      </Box>

      <Drawer
        anchor="top"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            mt: 9, mx: 2, borderRadius: 3, background: 'rgba(8,11,18,0.92)',
            backdropFilter: 'blur(24px)', border: `1px solid ${tokens.hairline}`, p: 2,
          },
        }}
      >
        <Stack spacing={0.5}>
          {links.map((l, i) => (
            <Button
              key={l.label}
              onClick={() => go(l.href)}
              sx={{
                justifyContent: 'flex-start', color: tokens.text, py: 1.25, fontSize: 16,
                animation: `riseIn 400ms cubic-bezier(0.32,0.72,0,1) ${i * 60}ms both`,
              }}
            >
              {l.label}
            </Button>
          ))}
          <Button
            onClick={() => go('/login')}
            sx={{ mt: 1, color: '#05070d', fontWeight: 700, py: 1.25, background: tokens.accentBright, '&:hover': { background: tokens.accent } }}
          >
            Sign in
          </Button>
        </Stack>
      </Drawer>
    </Box>
  );
}
