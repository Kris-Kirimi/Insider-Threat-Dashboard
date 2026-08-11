'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  TextField,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  createTheme,
  ThemeProvider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Grid,
  Card,
  CardContent,
  Divider,
  Stack,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import Sidebar from './components/SideBar';
import { createAlertsSocket } from '@/lib/alertsSockets';
import useSWR from 'swr';
import { apiGetWithAuth } from '@/lib/api';
import { appTheme, appBackground, tokens } from '@/lib/theme';

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
}

const API_BASE =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'
    : '';

const theme = appTheme;

interface AuditLog {
  user: string;
  action: string;
  timestamp: string;
}

type Severity = 'low' | 'medium' | 'high' | 'critical';
type AlertStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';

interface AlertItem {
  id: number;
  user: number;
  user_email: string;
  action: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  related_logs: number[];
  cleared: boolean;
  timestamp: string;
}

interface RiskScore {
  user_id: number;
  email: string;
  full_name: string;
  department: string | null;
  score: number;
  level: 'low' | 'elevated' | 'high' | 'critical';
  alert_count: number;
}

interface EvidenceLog {
  id: number;
  actor: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  timestamp: string;
}

const SEVERITY_COLOR: Record<Severity, string> = tokens.severity;

const RISK_COLOR: Record<RiskScore['level'], string> = tokens.risk;

const STATUS_LABEL: Record<AlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  resolved: 'Resolved',
  false_positive: 'False positive',
};

function FooterSection() {
  return (
    <Box
      component="footer"
      sx={{
        mt: 6,
        py: 3,
        textAlign: 'center',
        borderTop: `1px solid ${tokens.hairline}`,
      }}
    >
      <Typography variant="body2" sx={{ color: tokens.textFaint, fontSize: 13 }}>
        © {new Date().getFullYear()} InsiderDash — Insider Threat Monitoring
      </Typography>
    </Box>
  );
}

export default function InsiderThreatDashboard() {

  const [tabIndex, setTabIndex] = useState(0);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  // Filters
  const [logSearch, setLogSearch] = useState('');
  const [alertFilterSeverity, setAlertFilterSeverity] = useState<'all' | Severity>('all');
  const [token, setToken] = useState<string | null>(null);
  const [currentDateTimeStr, setCurrentDateTimeStr] = useState('');

  // Triage + risk
  const [risks, setRisks] = useState<RiskScore[]>([]);
  const [evidence, setEvidence] = useState<{ open: boolean; alert: AlertItem | null; logs: EvidenceLog[] }>(
    { open: false, alert: null, logs: [] },
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('accessToken'));
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchLogs();
      fetchAlerts();
      fetchRisks();
    }
    const updateDateTime = () => {
      setCurrentDateTimeStr(
        new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour12: true })
      );
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, [token]);

  async function fetchLogs() {
    setLogsLoading(true);
    setLogsError('');
    try {
      const res = await fetch(`${API_BASE}/api/audit/logs/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return redirectToLogin();
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      const auditLogs = data.audit_logs || data;
      setLogs(auditLogs);
    } catch (e: any) {
      setLogsError(e.message || 'Error loading logs');
    } finally {
      setLogsLoading(false);
    }
  }
   const {
      data: alertsData = [],
      isLoading: alertsLoading,
      error: alertsError,
      mutate: mutateAlerts,
    } = useSWR(
      token ? `${API_BASE}/api/monitoring/alerts/` : null,
      (url) => apiGetWithAuth(url, token)
  );

  useEffect(() => {
    if (!token) return;
    const ws = createAlertsSocket(token, (alert) => {
      mutateAlerts((existing: any[] = []) => [alert, ...existing], false);
    });
    return () => ws && ws.close();
  }, [token, mutateAlerts]);

  async function fetchRisks() {
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/risk-scores/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return redirectToLogin();
      if (!res.ok) return;
      setRisks(await res.json());
    } catch {
      /* non-fatal: risk panel simply stays empty */
    }
  }

  async function updateAlertStatus(alertId: number, status: AlertStatus) {
    const res = await fetch(`${API_BASE}/api/monitoring/alerts/${alertId}/status/`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.status === 401) return redirectToLogin();
    if (!res.ok) { alert('Failed to update alert'); return; }
    const closed = status === 'resolved' || status === 'false_positive';
    mutateAlerts((existing: AlertItem[] = []) =>
      existing.map((a) => (a.id === alertId ? { ...a, status, cleared: closed } : a)), false
    );
    fetchRisks();
  }

  async function openEvidence(item: AlertItem) {
    setEvidence({ open: true, alert: item, logs: [] });
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/alerts/${item.id}/evidence/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEvidence({ open: true, alert: item, logs: data.evidence || [] });
      }
    } catch {
      /* dialog still shows the alert description */
    }
  }

  // Use alertsData everywhere below instead of 'alerts'
  const alerts = alertsData as AlertItem[];
  async function fetchAlerts() {
    alertsLoading;
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/alerts/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch alerts');
      const data = await res.json();
      // alertsData(data.alerts || data); // Not needed, SWR handles data.
    } catch (e: any) {
      // alertsError(e.message || 'Error loading alerts'); // Not needed, SWR handles error.
    } finally {
      alertsLoading;
    }
  }

  // Filtered logs by search term
  const filteredLogs = logs.filter(
    (log) =>
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(logSearch.toLowerCase())
  );

  const filteredAlerts =
    alertFilterSeverity === 'all'
      ? alerts
      : alerts.filter((a) => a.severity === alertFilterSeverity);

  const severityCounts = alerts.reduce((acc, alert) => {
    acc[alert.severity] = (acc[alert.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const severityData = [
    { name: 'Low', value: severityCounts.low || 0, color: SEVERITY_COLOR.low },
    { name: 'Medium', value: severityCounts.medium || 0, color: SEVERITY_COLOR.medium },
    { name: 'High', value: severityCounts.high || 0, color: SEVERITY_COLOR.high },
    { name: 'Critical', value: severityCounts.critical || 0, color: SEVERITY_COLOR.critical },
  ];

  const COLORS = ['#00C49F', '#FFBB28', '#FF7043', '#FF4C4C', '#26C6DA', '#AB47BC'];

  // Top risky users from the server-side weighted score (not a raw count).
  const topUsersData = risks.slice(0, 5).map((r) => ({
    user: r.email.split('@')[0],
    score: r.score,
    color: RISK_COLOR[r.level],
  }));

  const actionCounts = logs.reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const actionData = Object.entries(actionCounts).map(([action, count]) => ({
    name: action,
    value: count,
  }));

  const userLogCounts = logs.reduce((acc, log) => {
    acc[log.user] = (acc[log.user] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topLogUsersData = Object.entries(userLogCounts)
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const openAlerts = alerts.filter((a) => a.status !== 'resolved' && a.status !== 'false_positive');
  const kpis = [
    { label: 'Open alerts', value: openAlerts.length, color: tokens.accentBright },
    { label: 'Critical', value: openAlerts.filter((a) => a.severity === 'critical').length, color: SEVERITY_COLOR.critical },
    { label: 'High-risk users', value: risks.filter((r) => r.level === 'high' || r.level === 'critical').length, color: SEVERITY_COLOR.high },
    { label: 'Audit events', value: logs.length, color: tokens.text },
  ];

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          minHeight: '100dvh',
          background: appBackground,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AuthedTopBar />
        <Box sx={{ display: 'flex', flex: 1 }}>
          <Sidebar />
          <Container
            maxWidth={false}
            sx={{
              flex: 1,
              p: { xs: 2, sm: 4 },
              ml: { xs: 0, md: '240px' },
              maxWidth: 1280,
            }}
          >
            {/* Header */}
            <Box sx={{ animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: tokens.severity.low, boxShadow: `0 0 10px ${tokens.severity.low}` }} />
                <Typography sx={{ fontSize: 12, color: tokens.textDim }}>
                  Live · updated {currentDateTimeStr || '…'}
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontSize: { xs: '1.9rem', sm: '2.5rem' } }}>
                Threat Overview
              </Typography>
              <Typography sx={{ mt: 1, color: tokens.textDim, maxWidth: 620 }}>
                Behavioural detections, risk scores and the full audit trail across every monitored user.
              </Typography>
            </Box>

            {/* KPI row */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mt: 4, mb: 4 }}>
              {kpis.map((k, i) => (
                <Box
                  key={k.label}
                  sx={{
                    p: 0.75, borderRadius: `${tokens.radius}px`, background: tokens.surface,
                    border: `1px solid ${tokens.hairline}`,
                    animation: `riseIn 600ms cubic-bezier(0.32,0.72,0,1) ${i * 70 + 80}ms both`,
                  }}
                >
                  <Box sx={{ borderRadius: `${tokens.radiusInner}px`, background: tokens.surfaceSolid, px: 3, py: 2.25, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                    <Typography sx={{ fontSize: 32, fontWeight: 800, color: k.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {k.value}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: tokens.textDim, mt: 0.75 }}>{k.label}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Tabs */}
            <Tabs
              value={tabIndex}
              onChange={(e, val) => setTabIndex(val)}
              aria-label="dashboard tabs"
              sx={{
                mb: 3,
                '& .MuiTab-root': {
                  color: '#bbb',
                  fontWeight: 500,
                  '&.Mui-selected': {
                    color: 'primary.main',
                  },
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: 'primary.main',
                },
              }}
            >
              <Tab label="Audit Logs" />
              <Tab label="Alerts & Summary" />
            </Tabs>

            {/* Tab 0: Audit Logs */}
            {tabIndex === 0 && (
              <Box>
                <TextField
                  placeholder="Search by user or action"
                  fullWidth
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                      '&:hover fieldset': { borderColor: 'primary.main' },
                      '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#bbb',
                      '&.Mui-focused': { color: 'primary.main' },
                    },
                    '& input': { color: '#fff' },
                  }}
                />
                {logsLoading ? (
                  <CircularProgress sx={{ display: 'block', mx: 'auto', color: 'primary.main' }} />
                ) : logsError ? (
                  <Alert severity="error" sx={{ mb: 2, background: 'rgba(244, 67, 54, 0.2)', color: '#fff' }}>
                    {logsError}
                  </Alert>
                ) : (
                  <TableContainer
                    component={Paper}
                    elevation={6}
                    sx={{ borderRadius: 3, overflow: 'hidden' }}
                  >
                    <Table>
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'primary.main' }}>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>User</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Action</TableCell>
                          <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Timestamp</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} align="center" sx={{ color: '#bbb' }}>
                              No logs found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredLogs.map((log, i) => (
                            <TableRow
                              key={i}
                              sx={{
                                '&:hover': {
                                  background: 'rgba(0, 188, 212, 0.2)',
                                  transition: 'background 0.3s',
                                },
                              }}
                            >
                              <TableCell sx={{ color: '#fff' }}>{log.user}</TableCell>
                              <TableCell sx={{ color: '#fff' }}>{log.action}</TableCell>
                              <TableCell sx={{ color: '#fff' }}>
                                {new Date(log.timestamp).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab 1: Alerts & Summary */}
            {tabIndex === 1 && (
              <Grid container spacing={3}>
                {/* Alerts Table */}
                <Grid item xs={12}>
                  <Card elevation={6}>
                    <CardContent>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        Active Alerts
                      </Typography>
                      <Stack direction="row" spacing={1} mb={3} flexWrap="wrap" useFlexGap>
                        {(['all', 'low', 'medium', 'high', 'critical'] as const).map((severity) => {
                          const active = alertFilterSeverity === severity;
                          const activeBg = severity === 'all' ? '#00bcd4' : SEVERITY_COLOR[severity];
                          return (
                            <Button
                              key={severity}
                              variant={active ? 'contained' : 'outlined'}
                              onClick={() => setAlertFilterSeverity(severity)}
                              sx={{
                                background: active ? activeBg : 'transparent',
                                color: active ? (severity === 'medium' ? '#000' : '#fff') : '#bbb',
                                borderColor: 'rgba(0, 188, 212, 0.5)',
                                '&:hover': {
                                  background: active ? activeBg : 'rgba(0, 188, 212, 0.2)',
                                  borderColor: 'primary.main',
                                },
                              }}
                            >
                              {severity.charAt(0).toUpperCase() + severity.slice(1)}
                            </Button>
                          );
                        })}
                      </Stack>
                      {alertsLoading ? (
                        <CircularProgress sx={{ display: 'block', mx: 'auto', color: 'primary.main' }} />
                      ) : alertsError ? (
                        <Alert severity="error" sx={{ mb: 2, background: 'rgba(244, 67, 54, 0.2)', color: '#fff' }}>
                          {alertsError}
                        </Alert>
                      ) : (
                        <TableContainer sx={{ borderRadius: 3, overflow: 'hidden' }}>
                          <Table>
                            <TableHead>
                              <TableRow sx={{ bgcolor: 'primary.main' }}>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>User</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Description</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Severity</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Status</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Time</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Triage</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {filteredAlerts.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={6} align="center" sx={{ color: '#bbb' }}>
                                    No alerts found
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredAlerts.map((alert) => {
                                  const closed = alert.status === 'resolved' || alert.status === 'false_positive';
                                  return (
                                  <TableRow
                                    key={alert.id}
                                    sx={{
                                      bgcolor: closed ? 'rgba(0, 188, 212, 0.06)' : undefined,
                                      opacity: closed ? 0.65 : 1,
                                      '&:hover': { background: 'rgba(0, 188, 212, 0.15)' },
                                    }}
                                  >
                                    <TableCell sx={{ color: '#fff' }}>{alert.user_email}</TableCell>
                                    <TableCell sx={{ color: '#fff' }}>
                                      <Box component="span" sx={{ fontWeight: 600 }}>{alert.action}</Box>
                                      <Box sx={{ color: '#9fb2c0', fontSize: '0.85rem' }}>{alert.description}</Box>
                                    </TableCell>
                                    <TableCell>
                                      <Box component="span" sx={{
                                        px: 1, py: 0.25, borderRadius: 1, fontSize: '0.75rem', fontWeight: 700,
                                        color: alert.severity === 'medium' ? '#000' : '#fff',
                                        background: SEVERITY_COLOR[alert.severity],
                                      }}>
                                        {alert.severity.toUpperCase()}
                                      </Box>
                                    </TableCell>
                                    <TableCell sx={{ color: '#cfe3ee', fontSize: '0.85rem' }}>
                                      {STATUS_LABEL[alert.status]}
                                    </TableCell>
                                    <TableCell sx={{ color: '#fff', whiteSpace: 'nowrap' }}>
                                      {new Date(alert.timestamp).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                      <Stack direction="row" spacing={0.5} alignItems="center">
                                        {alert.related_logs?.length > 0 && (
                                          <Button size="small" onClick={() => openEvidence(alert)}
                                            sx={{ color: '#00bcd4', minWidth: 0 }}>
                                            Evidence
                                          </Button>
                                        )}
                                        {!closed && (
                                          <TextField
                                            select SelectProps={{ native: true }} size="small"
                                            value={alert.status}
                                            onChange={(e) => updateAlertStatus(alert.id, e.target.value as AlertStatus)}
                                            sx={{
                                              minWidth: 130,
                                              '& .MuiInputBase-root': { color: '#fff', background: 'rgba(255,255,255,0.05)' },
                                              '& fieldset': { borderColor: 'rgba(0,188,212,0.4)' },
                                            }}
                                          >
                                            <option value="new">New</option>
                                            <option value="acknowledged">Acknowledge</option>
                                            <option value="investigating">Investigating</option>
                                            <option value="resolved">Resolve</option>
                                            <option value="false_positive">False positive</option>
                                          </TextField>
                                        )}
                                      </Stack>
                                    </TableCell>
                                  </TableRow>
                                  );
                                })
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* Severity Pie Chart */}
                <Grid item xs={12} sm={6}>
                  <Card elevation={6}>
                    <CardContent>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        Alerts by Severity
                      </Typography>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={severityData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label
                            animationDuration={800}
                          >
                            {severityData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'rgba(31, 44, 62, 0.9)', border: 'none', borderRadius: 8, color: '#fff' }} />
                          <Legend wrapperStyle={{ color: '#bbb' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Top Users Bar Chart */}
                <Grid item xs={12} sm={6}>
                  <Card elevation={6}>
                    <CardContent>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        Highest-Risk Users
                      </Typography>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={topUsersData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                          <XAxis dataKey="user" stroke="#bbb" />
                          <YAxis stroke="#bbb" />
                          <Tooltip contentStyle={{ background: 'rgba(31, 44, 62, 0.9)', border: 'none', borderRadius: 8, color: '#fff' }} />
                          <Bar dataKey="score" name="Risk score" animationDuration={800} radius={[4, 4, 0, 0]}>
                            {topUsersData.map((entry, index) => (
                              <Cell key={`risk-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Action Pie Chart */}
                <Grid item xs={12} sm={6}>
                  <Card elevation={6}>
                    <CardContent>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        Audit Logs by Action
                      </Typography>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={actionData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label
                            animationDuration={800}
                          >
                            {actionData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'rgba(31, 44, 62, 0.9)', border: 'none', borderRadius: 8, color: '#fff' }} />
                          <Legend wrapperStyle={{ color: '#bbb' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Top Log Users Bar Chart */}
                <Grid item xs={12} sm={6}>
                  <Card elevation={6}>
                    <CardContent>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        Top Users by Log Activity
                      </Typography>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={topLogUsersData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                          <XAxis dataKey="user" stroke="#bbb" />
                          <YAxis stroke="#bbb" />
                          <Tooltip contentStyle={{ background: 'rgba(31, 44, 62, 0.9)', border: 'none', borderRadius: 8, color: '#fff' }} />
                          <Bar dataKey="count" name="Log events" fill="#00bcd4" animationDuration={800} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}
          </Container>
        </Box>

        <Dialog open={evidence.open} onClose={() => setEvidence({ open: false, alert: null, logs: [] })}
          fullWidth maxWidth="md">
          <DialogTitle sx={{ background: '#111c2b', color: '#fff' }}>
            Evidence — {evidence.alert?.action}
          </DialogTitle>
          <DialogContent dividers sx={{ background: '#0f1826' }}>
            <Typography sx={{ color: '#9fb2c0', mb: 2 }}>{evidence.alert?.description}</Typography>
            <TableContainer component={Paper} sx={{ background: 'transparent' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#00bcd4' }}>Time</TableCell>
                    <TableCell sx={{ color: '#00bcd4' }}>Actor</TableCell>
                    <TableCell sx={{ color: '#00bcd4' }}>Action</TableCell>
                    <TableCell sx={{ color: '#00bcd4' }}>Resource</TableCell>
                    <TableCell sx={{ color: '#00bcd4' }}>IP</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {evidence.logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ color: '#6b7f8f' }}>
                      Loading evidence…
                    </TableCell></TableRow>
                  ) : evidence.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell sx={{ color: '#fff', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ color: '#fff' }}>{log.actor ?? '—'}</TableCell>
                      <TableCell sx={{ color: '#fff' }}>{log.action}</TableCell>
                      <TableCell sx={{ color: '#fff' }}>{log.resource ?? '—'}</TableCell>
                      <TableCell sx={{ color: '#fff' }}>{log.ip_address ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions sx={{ background: '#111c2b' }}>
            <Button onClick={() => setEvidence({ open: false, alert: null, logs: [] })}>Close</Button>
          </DialogActions>
        </Dialog>

        <FooterSection />
      </Box>
    </ThemeProvider>
  );
}