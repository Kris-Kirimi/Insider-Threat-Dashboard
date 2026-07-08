'use client';

import React, { useEffect, useState } from 'react';
import { Box, TextField, Button, Typography, CircularProgress, Link } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { routeForUser, SessionUser } from '@/lib/auth';
import { tokens, bezelShell, bezelCore } from '@/lib/theme';

interface FormData {
  email: string;
  password: string;
  otp: string;
}

const RESEND_COOLDOWN_S = 30;

const fieldSx = {
  mb: 1.5,
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    background: tokens.surface,
    '& fieldset': { borderColor: tokens.hairline },
    '&:hover fieldset': { borderColor: tokens.hairlineStrong },
    '&.Mui-focused fieldset': { borderColor: tokens.accent },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: tokens.accent },
};

const LoginForm: React.FC = () => {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({ email: '', password: '', otp: '' });
  const [step, setStep] = useState<'login' | 'otp'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  async function sendOtp() {
    await apiPost('/auth/login/', { email: form.email, password: form.password });
    setResendIn(RESEND_COOLDOWN_S);
  }

  const parseErr = (err: any, fallback: string) => {
    try {
      return JSON.parse(err?.message || '{}').detail || fallback;
    } catch {
      return fallback;
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in email and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendOtp();
      setStep('otp');
    } catch (err: any) {
      setError(parseErr(err, 'Network error — check that the backend is running'));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.otp) {
      setError('Please enter the OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiPost<{ tokens: { access: string; refresh?: string }; user: SessionUser }>(
        '/auth/verify-otp/',
        { email: form.email, otp: form.otp },
      );
      if (data?.tokens?.access) {
        localStorage.setItem('accessToken', data.tokens.access);
        if (data.tokens.refresh) localStorage.setItem('refreshToken', data.tokens.refresh);
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
        router.push(routeForUser(data.user ?? null));
      } else {
        setError('Invalid OTP');
      }
    } catch (err: any) {
      setError(parseErr(err, 'Invalid OTP'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      await sendOtp();
    } catch {
      setError('Could not resend the code. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', px: 2, py: 6 }}>
      <Box sx={{ ...bezelShell, width: '100%', maxWidth: 430, animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
        <Box sx={{ ...bezelCore, p: { xs: 3, sm: 4 } }}>
          <Box
            sx={{
              width: 52, height: 52, borderRadius: '15px', mx: 'auto', mb: 2.5, display: 'grid', placeItems: 'center',
              background: tokens.accentDim, border: `1px solid ${tokens.accent}33`, color: tokens.accent,
            }}
          >
            {step === 'login' ? <LockOutlinedIcon /> : <MarkEmailReadOutlinedIcon />}
          </Box>
          <Typography variant="h5" sx={{ textAlign: 'center', fontWeight: 700 }}>
            Sign in to InsiderDash
          </Typography>
          <Typography sx={{ mt: 1, mb: 3, textAlign: 'center', color: tokens.textDim, fontSize: 14 }}>
            {step === 'login' ? 'Use your work email and password' : `Enter the 6-digit code sent to ${form.email}`}
          </Typography>

          <form onSubmit={step === 'login' ? handleLoginSubmit : handleOtpSubmit}>
            {step === 'login' ? (
              <>
                <TextField fullWidth label="Email" name="email" type="email" autoComplete="email"
                  value={form.email} onChange={handleChange} sx={fieldSx} />
                <TextField fullWidth label="Password" name="password" type="password" autoComplete="current-password"
                  value={form.password} onChange={handleChange} sx={fieldSx} />
              </>
            ) : (
              <TextField fullWidth label="One-time code" name="otp" autoComplete="one-time-code"
                inputProps={{ inputMode: 'numeric', maxLength: 6 }} value={form.otp} onChange={handleChange} sx={fieldSx} />
            )}

            {error && <Typography sx={{ color: tokens.severity.critical, mb: 1, fontSize: 14 }}>{error}</Typography>}

            <Button
              type="submit" fullWidth disabled={loading}
              sx={{ mt: 1, py: 1.25, background: tokens.accentBright, color: '#05070d', fontWeight: 700, '&:hover': { background: tokens.accent } }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: '#05070d' }} /> : step === 'login' ? 'Continue' : 'Verify and sign in'}
            </Button>
          </form>

          {step === 'otp' && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
              <Link component="button" underline="hover" sx={{ color: tokens.textDim, fontSize: 13 }}
                onClick={() => { setStep('login'); setForm((f) => ({ ...f, otp: '' })); setError(''); }}>
                Use a different account
              </Link>
              <Link component="button" underline="hover" sx={{ color: resendIn > 0 ? tokens.textFaint : tokens.accent, fontSize: 13 }}
                onClick={handleResend} disabled={resendIn > 0}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </Link>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LoginForm;
