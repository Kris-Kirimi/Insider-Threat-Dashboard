'use client';

import React, { useEffect, useState } from 'react';
import { Box, Typography, Avatar, Menu, MenuItem, Divider, IconButton, Tooltip } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { useRouter } from 'next/navigation';
import { getSessionUser, SessionUser } from '@/lib/auth';
import { apiPost } from '@/lib/api';
import { tokens } from '@/lib/theme';

/**
 * Slim glass top bar for authenticated pages: brand mark, the signed-in
 * identity, and a sign-out action. Floats with a hairline and blur.
 */
export default function AuthedTopBar({ accent = tokens.accent }: { accent?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => setUser(getSessionUser()), []);

  const initials = (user?.full_name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  async function signOut() {
    try {
      await apiPost('/logout/', {});
    } catch {
      /* logout is best-effort; clear the session regardless */
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    router.push('/login');
  }

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        px: { xs: 2, md: 4 },
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(5,7,13,0.72)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${tokens.hairline}`,
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, cursor: 'pointer' }}
        onClick={() => router.push('/')}
      >
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: '11px',
            display: 'grid',
            placeItems: 'center',
            background: `linear-gradient(140deg, ${accent}, rgba(99,102,241,0.9))`,
            boxShadow: `0 6px 18px ${accent}33`,
          }}
        >
          <ShieldOutlinedIcon sx={{ fontSize: 19, color: '#05070d' }} />
        </Box>
        <Typography sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: 18 }}>
          InsiderDash
        </Typography>
      </Box>

      {user && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
              {user.full_name || user.email}
            </Typography>
            <Typography sx={{ fontSize: 11, color: tokens.textFaint }}>
              {user.is_staff ? 'Administrator' : user.department || 'Employee'}
            </Typography>
          </Box>
          <Tooltip title="Account">
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#05070d',
                  background: `linear-gradient(140deg, ${accent}, #6366f1)`,
                }}
              >
                {initials}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 200,
                background: tokens.surfaceSolid,
                border: `1px solid ${tokens.hairline}`,
                borderRadius: 2,
              },
            }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{user.email}</Typography>
              <Typography sx={{ fontSize: 11, color: tokens.textFaint }}>
                {user.role_name || (user.is_staff ? 'Administrator' : 'Employee')}
              </Typography>
            </Box>
            <Divider sx={{ borderColor: tokens.hairline }} />
            <MenuItem onClick={signOut} sx={{ gap: 1.25, fontSize: 14, py: 1.25 }}>
              <LogoutRoundedIcon sx={{ fontSize: 18 }} /> Sign out
            </MenuItem>
          </Menu>
        </Box>
      )}
    </Box>
  );
}
