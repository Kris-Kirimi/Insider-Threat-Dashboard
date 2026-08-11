'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, FormControlLabel, InputAdornment,
  IconButton, Snackbar, Switch, TextField, Typography,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { SessionUser } from '@/lib/auth';
import { tokens } from '@/lib/theme';

export const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    background: tokens.surface,
    '& fieldset': { borderColor: tokens.hairline },
    '&:hover fieldset': { borderColor: tokens.hairlineStrong },
    '&.Mui-focused fieldset': { borderColor: tokens.accent },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: tokens.accent },
};

const primaryBtn = {
  background: tokens.accentBright, color: '#05070d', fontWeight: 700,
  '&:hover': { background: tokens.accent },
};

type Feedback = { open: boolean; msg: string; severity: 'success' | 'error' };

function useFeedback() {
  const [feedback, setFeedback] = useState<Feedback>({ open: false, msg: '', severity: 'success' });
  const notify = (msg: string, severity: Feedback['severity'] = 'success') =>
    setFeedback({ open: true, msg, severity });
  const element = (
    <Snackbar
      open={feedback.open} autoHideDuration={4000}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      onClose={() => setFeedback((f) => ({ ...f, open: false }))}
    >
      <Alert severity={feedback.severity} variant="filled"
        onClose={() => setFeedback((f) => ({ ...f, open: false }))}>
        {feedback.msg}
      </Alert>
    </Snackbar>
  );
  return { notify, element };
}

/** Read the first useful message out of a DRF error body. */
function apiMessage(err: any, fallback: string): string {
  try {
    const parsed = JSON.parse(err?.message || '{}');
    const first = parsed.detail ?? Object.values(parsed)[0];
    return Array.isArray(first) ? first.join(' ') : String(first ?? fallback);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- Profile
export function ProfilePanel({ user }: { user: SessionUser | null }) {
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const { notify, element } = useFeedback();

  useEffect(() => setFullName(user?.full_name ?? ''), [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await apiPatch(`/users/${user.id}/`, { full_name: fullName });
      const cached = { ...user, full_name: fullName };
      localStorage.setItem('user', JSON.stringify(cached));
      notify('Profile updated');
    } catch (err: any) {
      notify(apiMessage(err, 'Could not update your profile'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h6">Personal information</Typography>
      <TextField fullWidth label="Full name" value={fullName} sx={fieldSx}
        onChange={(e) => setFullName(e.target.value)} />
      <TextField
        fullWidth label="Email" value={user?.email ?? ''} disabled sx={fieldSx}
        helperText="Your sign-in address cannot be changed here — ask an administrator."
      />
      <TextField fullWidth label="Department" value={user?.department ?? '—'} disabled sx={fieldSx} />
      <TextField fullWidth label="Role" value={user?.role_name ?? '—'} disabled sx={fieldSx} />
      <Button sx={{ ...primaryBtn, mt: 1, justifySelf: 'start', px: 3 }}
        onClick={save} disabled={saving}>
        {saving ? <CircularProgress size={18} /> : 'Save changes'}
      </Button>
      {element}
    </Box>
  );
}

// --------------------------------------------------------------- Security
export function SecurityPanel() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const { notify, element } = useFeedback();

  const field = (label: string, key: 'current' | 'next' | 'confirm') => (
    <TextField
      fullWidth label={label} sx={fieldSx}
      type={show[key] ? 'text' : 'password'}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton edge="end" sx={{ color: tokens.textDim }}
              onClick={() => setShow({ ...show, [key]: !show[key] })}>
              {show[key] ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );

  async function save() {
    if (!form.current || !form.next) {
      notify('Enter your current and new password', 'error');
      return;
    }
    if (form.next !== form.confirm) {
      notify('The new passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/users/change-password/', {
        current_password: form.current,
        new_password: form.next,
      });
      setForm({ current: '', next: '', confirm: '' });
      notify('Password updated');
    } catch (err: any) {
      // The server runs Django's password validators; surface their wording.
      notify(apiMessage(err, 'Could not change your password'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h6">Password</Typography>
      {field('Current password', 'current')}
      {field('New password', 'next')}
      {field('Confirm new password', 'confirm')}
      <Button sx={{ ...primaryBtn, mt: 1, justifySelf: 'start', px: 3 }}
        onClick={save} disabled={saving}>
        {saving ? <CircularProgress size={18} /> : 'Update password'}
      </Button>
      {element}
    </Box>
  );
}

// ------------------------------------------------------------ Preferences
type Preferences = {
  alert_emails: boolean;
  activity_reports: boolean;
  email_notifications: boolean;
  show_help_tooltips: boolean;
  compact_tables: boolean;
};

const NOTIFICATION_FIELDS: [keyof Preferences, string][] = [
  ['alert_emails', 'Email me when an alert is raised'],
  ['activity_reports', 'Send me periodic activity reports'],
  ['email_notifications', 'Allow other email notifications'],
];

const DISPLAY_FIELDS: [keyof Preferences, string][] = [
  ['show_help_tooltips', 'Show help tooltips'],
  ['compact_tables', 'Use compact tables'],
];

function PreferencesPanel({ title, fields }: { title: string; fields: [keyof Preferences, string][] }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const { notify, element } = useFeedback();

  useEffect(() => {
    apiGet<Preferences>('/users/preferences/')
      .then(setPrefs)
      .catch(() => notify('Could not load your preferences', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      // Only this panel's fields, so saving one panel never clobbers another.
      const payload = Object.fromEntries(fields.map(([key]) => [key, prefs[key]]));
      await apiPatch('/users/preferences/', payload);
      notify('Preferences saved');
    } catch (err: any) {
      notify(apiMessage(err, 'Could not save your preferences'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      {fields.map(([key, label]) => (
        <FormControlLabel
          key={key}
          control={
            <Switch color="primary" checked={Boolean(prefs[key])}
              onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} />
          }
          label={label}
        />
      ))}
      <Button sx={{ ...primaryBtn, mt: 2, justifySelf: 'start', px: 3 }}
        onClick={save} disabled={saving}>
        {saving ? <CircularProgress size={18} /> : 'Save preferences'}
      </Button>
      {element}
    </Box>
  );
}

export function NotificationsPanel() {
  return <PreferencesPanel title="Notification preferences" fields={NOTIFICATION_FIELDS} />;
}

export function DisplayPanel() {
  return <PreferencesPanel title="Display preferences" fields={DISPLAY_FIELDS} />;
}
