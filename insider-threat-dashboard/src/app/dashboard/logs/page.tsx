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
} from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
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
import Sidebar from '../components/SideBar';
import { createAlertsSocket } from '@/lib/alertsSockets';
import useSWR from 'swr';
import { apiGetWithAuth } from '@/lib/api';
import { appTheme, appBackground } from '@/lib/theme';

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

interface AlertItem {
  id: number;
  user: string;
  action: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  cleared: boolean;
  timestamp: string;
}

function FooterSection() {
  return (
    <Box component="footer" sx={{ mt: 6, py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <Typography variant="body2" sx={{ color: '#5b6b7b', fontSize: 13 }}>
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
  const [alertFilterSeverity, setAlertFilterSeverity] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [token, setToken] = useState<string | null>(null);
  const [currentDateTimeStr, setCurrentDateTimeStr] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('accessToken'));
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchLogs();
      fetchAlerts();
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
      const res = await fetch(`${API_BASE}/api/users/audit/logs/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

    async function clearAlert(alertId: number) {
    const res = await fetch(`${API_BASE}/api/monitoring/alerts/${alertId}/clear/`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) { alert('Failed to clear alert'); return; }
    // optimistic update
    mutateAlerts((existing: any[] = []) =>
      existing.map((a: any) => (a.id === alertId ? { ...a, cleared: true } : a)), false
    );
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
    { name: 'Low', value: severityCounts.low || 0 },
    { name: 'Medium', value: severityCounts.medium || 0 },
    { name: 'High', value: severityCounts.high || 0 },
  ];

  const COLORS = ['#00C49F', '#FFBB28', '#FF4C4C'];

  const userAlertCounts: Record<string, number> = {};
  alerts.forEach((a) => {
    if (!a.cleared) userAlertCounts[a.user] = (userAlertCounts[a.user] || 0) + 1;
  });
  const topUsersData = Object.entries(userAlertCounts)
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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
            <Typography
              variant="h6"
              color="text.secondary"
              gutterBottom
              sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}
            >
              Last Updated: {currentDateTimeStr || 'Loading...'}
            </Typography>
            <Typography
              variant="h4"
              gutterBottom
              sx={{
                color: 'primary.main',
                fontWeight: 'bold',
                textAlign: { xs: 'center', sm: 'left' },
                fontSize: { xs: '1.8rem', sm: '2.5rem' },
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              }}
            >
              Insider Threat Detection Dashboard
            </Typography>
            <Divider sx={{ mb: 3, borderColor: 'rgba(0, 188, 212, 0.2)' }} />

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
                      <Stack direction="row" spacing={1} mb={3}>
                        {['all', 'low', 'medium', 'high'].map((severity) => (
                          <Button
                            key={severity}
                            variant={alertFilterSeverity === severity ? 'contained' : 'outlined'}
                            onClick={() => setAlertFilterSeverity(severity as any)}
                            sx={{
                              background:
                                alertFilterSeverity === severity
                                  ? severity === 'low'
                                    ? '#00C49F'
                                    : severity === 'medium'
                                    ? '#FFBB28'
                                    : severity === 'high'
                                    ? '#FF4C4C'
                                    : 'primary.main'
                                  : 'transparent',
                              color:
                                alertFilterSeverity === severity
                                  ? severity === 'medium'
                                    ? '#000'
                                    : '#fff'
                                  : '#bbb',
                              borderColor: 'rgba(0, 188, 212, 0.5)',
                              '&:hover': {
                                background:
                                  alertFilterSeverity === severity
                                    ? undefined
                                    : 'rgba(0, 188, 212, 0.2)',
                                borderColor: 'primary.main',
                              },
                            }}
                          >
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </Button>
                        ))}
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
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Action</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Description</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Severity</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Timestamp</TableCell>
                                <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Clear</TableCell>
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
                                filteredAlerts.map((alert) => (
                                  <TableRow
                                    key={alert.id}
                                    sx={{
                                      bgcolor: alert.cleared ? 'rgba(0, 188, 212, 0.1)' : undefined,
                                      '&:hover': {
                                        background: 'rgba(0, 188, 212, 0.2)',
                                        transition: 'background 0.3s',
                                      },
                                    }}
                                  >
                                    <TableCell sx={{ color: '#fff' }}>{alert.user}</TableCell>
                                    <TableCell sx={{ color: '#fff' }}>{alert.action}</TableCell>
                                    <TableCell sx={{ color: '#fff' }}>{alert.description}</TableCell>
                                    <TableCell
                                      sx={{
                                        color:
                                          alert.severity === 'high'
                                            ? 'secondary.main'
                                            : alert.severity === 'medium'
                                            ? '#FFBB28'
                                            : '#00C49F',
                                        fontWeight: 'bold',
                                      }}
                                    >
                                      {alert.severity.toUpperCase()}
                                    </TableCell>
                                    <TableCell sx={{ color: '#fff' }}>
                                      {new Date(alert.timestamp).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                      {!alert.cleared && (
                                        <IconButton
                                          color="primary"
                                          onClick={() => clearAlert(alert.id)}
                                          sx={{
                                            '&:hover': {
                                              background: 'rgba(0, 188, 212, 0.3)',
                                            },
                                          }}
                                          aria-label={`Clear alert ${alert.id}`}
                                        >
                                          <CheckCircleOutline />
                                        </IconButton>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))
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

                {/* Top Users Bar Chart */}
                <Grid item xs={12} sm={6}>
                  <Card elevation={6}>
                    <CardContent>
                      <Typography
                        variant="h6"
                        gutterBottom
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        Top Users by Active Alerts
                      </Typography>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={topUsersData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                          <XAxis dataKey="user" stroke="#bbb" />
                          <YAxis stroke="#bbb" />
                          <Tooltip contentStyle={{ background: 'rgba(31, 44, 62, 0.9)', border: 'none', borderRadius: 8, color: '#fff' }} />
                          <Legend wrapperStyle={{ color: '#bbb' }} />
                          <Bar dataKey="count" fill="primary.main" animationDuration={800} />
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
                          <Legend wrapperStyle={{ color: '#bbb' }} />
                          <Bar dataKey="count" fill="primary.main" animationDuration={800} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}
          </Container>
        </Box>
        <FooterSection />
      </Box>
    </ThemeProvider>
  );
}