'use client';

import React from 'react';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import SpaceDashboardRoundedIcon from '@mui/icons-material/SpaceDashboardRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import PolicyRoundedIcon from '@mui/icons-material/PolicyRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { useRouter, usePathname } from 'next/navigation';
import { tokens } from '@/lib/theme';

const menuItems = [
  { text: 'Overview', path: '/dashboard', icon: <SpaceDashboardRoundedIcon /> },
  { text: 'Users', path: '/dashboard/users', icon: <GroupRoundedIcon /> },
  { text: 'Rule Engine', path: '/dashboard/ruleengine', icon: <PolicyRoundedIcon /> },
  { text: 'Threat Logs', path: '/dashboard/logs', icon: <ReceiptLongRoundedIcon /> },
  { text: 'Settings', path: '/dashboard/settings', icon: <SettingsRoundedIcon /> },
];

const Sidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Box
      component="nav"
      sx={{
        width: { xs: 0, md: 240 },
        display: { xs: 'none', md: 'block' },
        flexShrink: 0,
        height: 'calc(100dvh - 65px)',
        position: 'fixed',
        top: 65,
        left: 0,
        background: 'rgba(8,11,18,0.6)',
        backdropFilter: 'blur(16px)',
        borderRight: `1px solid ${tokens.hairline}`,
        px: 1.5,
        py: 3,
        zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <Typography
        sx={{ px: 2, mb: 1.5, fontSize: 10, letterSpacing: '0.22em', color: tokens.textFaint, fontWeight: 700 }}
      >
        CONSOLE
      </Typography>
      <List sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {menuItems.map((item) => {
          const active = pathname === item.path;
          return (
            <ListItemButton
              key={item.text}
              onClick={() => router.push(item.path)}
              sx={{
                borderRadius: '12px',
                py: 1.1,
                position: 'relative',
                color: active ? tokens.text : tokens.textDim,
                background: active ? tokens.accentDim : 'transparent',
                border: `1px solid ${active ? `${tokens.accent}33` : 'transparent'}`,
                transition: 'all 180ms cubic-bezier(0.32,0.72,0,1)',
                '&:hover': { background: active ? tokens.accentDim : 'rgba(255,255,255,0.04)', color: tokens.text },
                '&::before': active
                  ? {
                      content: '""', position: 'absolute', left: 0, top: '50%',
                      transform: 'translateY(-50%)', width: 3, height: 18,
                      borderRadius: 4, background: tokens.accent,
                    }
                  : {},
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: active ? tokens.accent : tokens.textFaint }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 600 : 500 }} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
};

export default Sidebar;
