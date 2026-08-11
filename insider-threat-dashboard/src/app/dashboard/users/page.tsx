'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, MenuItem, Snackbar, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, ThemeProvider, Tooltip,
  Typography, CssBaseline,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import Sidebar from '../components/SideBar';
import FooterSection from '@/app/components/FooterSection';
import EditAccessDialog from '@/app/components/EditAccessDialog';
import UploadResourceButton from '@/app/components/UploadResourceButton';
import { apiGet, apiPost, apiPatch, apiDelete, apiDownload } from '@/lib/api';
import { ResourceDto, can } from '@/types/resource';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  department?: string | null;
  role?: number | null;
  role_name?: string | null;
  role_level?: number | null;
  is_staff?: boolean;
  is_simulated_threat: boolean;
}

interface Role {
  id: number;
  name: string;      // "Manager (Finance)" -- composite, as EditAccessDialog needs
  label: string;     // "Manager"
  level: number;
  department: string;
}

interface Dept { id: number; name: string; }

type Toast = { open: boolean; msg: string; severity: 'success' | 'error' | 'info' };

const emptyUserForm = {
  email: '', full_name: '', department: '', role: '' as '' | number,
  password: '', is_simulated_threat: false,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [resources, setResources] = useState<ResourceDto[]>([]);

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [filesError, setFilesError] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<Toast>({ open: false, msg: '', severity: 'info' });

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [saving, setSaving] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkRole, setBulkRole] = useState<'' | number>('');

  const [accessFor, setAccessFor] = useState<ResourceDto | null>(null);
  const [busyResourceId, setBusyResourceId] = useState<number | null>(null);

  const show = (msg: string, severity: Toast['severity'] = 'info') =>
    setToast({ open: true, msg, severity });

  const errorText = (err: any, fallback: string) => {
    try {
      const parsed = JSON.parse(err?.message || '{}');
      const first = parsed.detail ?? Object.values(parsed)[0];
      return Array.isArray(first) ? first.join(' ') : String(first ?? fallback);
    } catch {
      return fallback;
    }
  };

  // ---------------------------------------------------------------- loading
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      setUsers(await apiGet<AdminUser[]>('/users/'));
    } catch (err: any) {
      setUsersError(errorText(err, 'Failed to load users'));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadResources = useCallback(async () => {
    setFilesError('');
    try {
      setResources(await apiGet<ResourceDto[]>('/resources/'));
    } catch (err: any) {
      setFilesError(errorText(err, 'Failed to load files'));
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadResources();
    apiGet<Role[]>('/roles/').then(setRoles).catch(() => undefined);
    apiGet<Dept[]>('/departments/').then(setDepts).catch(() => undefined);
  }, [loadUsers, loadResources]);

  // ------------------------------------------------------------------ users
  function openCreate() {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setUserModalOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      full_name: user.full_name,
      department: user.department || '',
      role: user.role ?? '',
      password: '',
      is_simulated_threat: user.is_simulated_threat,
    });
    setUserModalOpen(true);
  }

  async function saveUser() {
    if (!userForm.email || !userForm.full_name) {
      show('Email and full name are required', 'error');
      return;
    }
    setSaving(true);
    try {
      // `role` is what every authorization decision reads -- it is the field
      // that must be set. (Django Groups were removed; assigning one granted
      // nothing.)
      const payload: Record<string, unknown> = {
        email: userForm.email,
        full_name: userForm.full_name,
        department: userForm.department || null,
        role: userForm.role === '' ? null : userForm.role,
        is_simulated_threat: userForm.is_simulated_threat,
      };
      if (userForm.password) payload.password = userForm.password;

      if (editingUser) {
        // PATCH, not PUT: `email` is writable (an admin must set it on
        // create), which makes it required on PUT.
        await apiPatch(`/users/${editingUser.id}/`, payload);
        show('User updated', 'success');
      } else {
        await apiPost('/users/', payload);
        show('User created', 'success');
      }
      setUserModalOpen(false);
      loadUsers();
    } catch (err: any) {
      show(errorText(err, 'Could not save the user'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    try {
      await apiDelete(`/users/${user.id}/`);
      show('User deleted', 'success');
      loadUsers();
    } catch (err: any) {
      show(errorText(err, 'Could not delete the user'), 'error');
    }
  }

  async function applyBulkRole() {
    if (bulkRole === '' || selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((id) =>
        apiPatch(`/users/${id}/`, { role: bulkRole })));
      show(`Role applied to ${selectedIds.length} user(s)`, 'success');
      setSelectedIds([]);
      setBulkRole('');
      loadUsers();
    } catch (err: any) {
      show(errorText(err, 'Bulk update failed'), 'error');
    }
  }

  async function toggleSimulatedThreat(user: AdminUser) {
    try {
      await apiPatch(`/users/${user.id}/`, {
        is_simulated_threat: !user.is_simulated_threat,
      });
      loadUsers();
    } catch (err: any) {
      show(errorText(err, 'Could not update the user'), 'error');
    }
  }

  // -------------------------------------------------------------- resources
  async function deleteResource(resource: ResourceDto) {
    if (!window.confirm(`Delete ${resource.name}?`)) return;
    try {
      await apiDelete(`/resources/${resource.id}/`);
      show('File deleted', 'success');
      loadResources();
    } catch (err: any) {
      show(err?.status === 403 ? 'You cannot delete this file' : 'Delete failed', 'error');
    }
  }

  async function downloadResource(resource: ResourceDto) {
    setBusyResourceId(resource.id);
    try {
      await apiDownload(`/resources/${resource.id}/download/`, resource.name);
    } catch (err: any) {
      show(err?.status === 403
        ? 'You do not have download permission for this file'
        : 'Download failed', 'error');
    } finally {
      setBusyResourceId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const needle = search.toLowerCase();
    return users.filter((u) =>
      u.email.toLowerCase().includes(needle) ||
      (u.full_name || '').toLowerCase().includes(needle));
  }, [users, search]);

  const resourcesByDept = useMemo(() => {
    const groups: Record<string, ResourceDto[]> = {};
    resources.forEach((r) => { (groups[r.department] ||= []).push(r); });
    return groups;
  }, [resources]);

  const initials = (user: AdminUser) =>
    (user.full_name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2)
      .map((s) => s[0]?.toUpperCase()).join('');

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, display: 'flex', flexDirection: 'column' }}>
        <AuthedTopBar />
        <Box sx={{ display: 'flex', flex: 1 }}>
          <Sidebar />
          <Container maxWidth={false} sx={{ flex: 1, p: { xs: 2, sm: 4 }, ml: { xs: 0, md: '240px' }, maxWidth: 1280 }}>
            <Box sx={{ animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
              <Typography sx={{ color: tokens.accent, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 12, fontWeight: 600, mb: 1.5 }}>
                Administration
              </Typography>
              <Typography variant="h4">Users &amp; files</Typography>
              <Typography sx={{ mt: 1, color: tokens.textDim, maxWidth: 640 }}>
                A person&apos;s <strong>role</strong> decides what they can do — level 3
                (Manager) and above may write and delete within their department.
              </Typography>
            </Box>

            {/* ------------------------------------------------------ users */}
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap
              sx={{ mt: 4, mb: 2, alignItems: 'center' }}>
              <TextField
                size="small" placeholder="Search users" value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: <SearchRoundedIcon sx={{ color: tokens.textFaint, mr: 1, fontSize: 20 }} />,
                  sx: { borderRadius: 999, background: tokens.surface },
                }}
                sx={{ minWidth: 260 }}
              />
              <Button startIcon={<AddRoundedIcon />} onClick={openCreate}
                sx={{ color: tokens.text, border: `1px solid ${tokens.hairline}`, '&:hover': { borderColor: tokens.accent } }}>
                New user
              </Button>

              {selectedIds.length > 0 && (
                <>
                  <TextField
                    select size="small" label={`Set role for ${selectedIds.length}`}
                    value={bulkRole} sx={{ minWidth: 240 }}
                    onChange={(e) => setBulkRole(Number(e.target.value))}
                  >
                    {roles.map((r) => (
                      <MenuItem key={r.id} value={r.id}>{r.name} · L{r.level}</MenuItem>
                    ))}
                  </TextField>
                  <Button variant="contained" onClick={applyBulkRole} disabled={bulkRole === ''}>
                    Apply
                  </Button>
                </>
              )}
            </Stack>

            {usersError && <Alert severity="error" sx={{ mb: 2 }}>{usersError}</Alert>}
            {usersLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress sx={{ color: tokens.accent }} />
              </Box>
            )}

            <Box sx={{ ...bezelShell, mb: 5 }}>
              <TableContainer sx={{ ...bezelCore }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      {['User', 'Department', 'Role', 'Simulated threat', 'Actions'].map((h) => (
                        <TableCell key={h} sx={{ color: tokens.accent, fontWeight: 600 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small" checked={selectedIds.includes(user.id)}
                            onChange={(e) => setSelectedIds((prev) =>
                              e.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id))}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar sx={{ width: 30, height: 30, fontSize: 12, background: tokens.accentDim, color: tokens.accent }}>
                              {initials(user)}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontSize: 14, color: tokens.text }}>{user.full_name || '—'}</Typography>
                              <Typography sx={{ fontSize: 12, color: tokens.textFaint }}>{user.email}</Typography>
                            </Box>
                            {user.is_staff && (
                              <Chip size="small" label="Admin" sx={{ fontSize: 10, height: 20, color: tokens.accent, background: tokens.accentDim }} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: tokens.textDim }}>{user.department || '—'}</TableCell>
                        <TableCell>
                          {user.role_name ? (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Typography sx={{ fontSize: 13, color: tokens.text }}>{user.role_name}</Typography>
                              <Chip size="small" label={`L${user.role_level ?? '?'}`}
                                sx={{ fontSize: 10, height: 18, color: tokens.textDim, background: tokens.surface }} />
                            </Stack>
                          ) : (
                            <Tooltip title="No role: this account has no privileges">
                              <Chip size="small" label="No role"
                                sx={{ fontSize: 11, color: tokens.severity.high, background: `${tokens.severity.high}18` }} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switchish checked={user.is_simulated_threat} onToggle={() => toggleSimulatedThreat(user)} />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Edit">
                              <IconButton size="small" sx={{ color: tokens.accent }} onClick={() => openEdit(user)}>
                                <EditRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" sx={{ color: tokens.severity.critical }} onClick={() => deleteUser(user)}>
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!usersLoading && filteredUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ color: tokens.textFaint, py: 4 }}>
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* -------------------------------------------------- resources */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              <Typography variant="h5" sx={{ flexGrow: 1 }}>Files</Typography>
              <UploadResourceButton
                onUploaded={(created) => {
                  loadResources();
                  setAccessFor(created);
                  show(`Uploaded ${created.name} — now set who can use it`, 'success');
                }}
                onError={(msg) => show(msg, 'error')}
              />
            </Stack>

            {filesError && <Alert severity="error" sx={{ mb: 2 }}>{filesError}</Alert>}

            {Object.entries(resourcesByDept).map(([department, files]) => (
              <Box key={department} sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1.5, fontSize: 16, color: tokens.textDim }}>
                  {department}
                </Typography>
                <Box sx={{ ...bezelShell }}>
                  <TableContainer sx={{ ...bezelCore }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {['Name', 'Type', 'Owner', 'Your access', 'Actions'].map((h) => (
                            <TableCell key={h} sx={{ color: tokens.accent, fontWeight: 600 }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {files.map((file) => {
                          const access = file.access_for_current_user;
                          return (
                            <TableRow key={file.id} hover>
                              <TableCell sx={{ color: tokens.text }}>{file.name}</TableCell>
                              <TableCell sx={{ color: tokens.textDim }}>{file.is_folder ? 'Folder' : 'File'}</TableCell>
                              <TableCell sx={{ color: tokens.textDim }}>{file.created_by ?? '—'}</TableCell>
                              <TableCell sx={{ color: tokens.textDim }}>{access.replace('_', ' ')}</TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={0.5}>
                                  {can(access, 'delete') && (
                                    <Tooltip title="Manage access">
                                      <IconButton size="small" sx={{ color: tokens.accent }} onClick={() => setAccessFor(file)}>
                                        <TuneRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  {!file.is_folder && (can(access, 'download') ? (
                                    <Tooltip title="Download">
                                      <span>
                                        <IconButton size="small" sx={{ color: tokens.accent }}
                                          disabled={busyResourceId === file.id}
                                          onClick={() => downloadResource(file)}>
                                          {busyResourceId === file.id
                                            ? <CircularProgress size={16} />
                                            : <DownloadRoundedIcon fontSize="small" />}
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title="Read-only: download not permitted">
                                      <span>
                                        <IconButton size="small" disabled>
                                          <LockRoundedIcon fontSize="small" sx={{ color: tokens.textFaint }} />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  ))}
                                  {can(access, 'delete') && (
                                    <Tooltip title="Delete">
                                      <IconButton size="small" sx={{ color: tokens.severity.critical }}
                                        onClick={() => deleteResource(file)}>
                                        <DeleteOutlineRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Box>
            ))}

            {!filesError && resources.length === 0 && (
              <Typography sx={{ color: tokens.textFaint, textAlign: 'center', py: 4 }}>
                No files yet. Upload one to get started.
              </Typography>
            )}

            <FooterSection />
          </Container>
        </Box>

        {/* --------------------------------------------------- user modal */}
        <Dialog open={userModalOpen} onClose={() => setUserModalOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{editingUser ? `Edit ${editingUser.email}` : 'New user'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField fullWidth label="Email" type="email" value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              <TextField fullWidth label="Full name" value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} />
              <TextField select fullWidth label="Department" value={userForm.department}
                onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}>
                <MenuItem value="">— None —</MenuItem>
                {depts.map((d) => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
              </TextField>
              <TextField
                select fullWidth label="Role" value={userForm.role}
                helperText="Role determines what this person may do. Level 3+ can write and delete."
                onChange={(e) => setUserForm({
                  ...userForm,
                  role: e.target.value === '' ? '' : Number(e.target.value),
                })}
              >
                <MenuItem value="">— No role (no privileges) —</MenuItem>
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>{r.name} · Level {r.level}</MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth type="password" label={editingUser ? 'New password (optional)' : 'Password'}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Checkbox checked={userForm.is_simulated_threat}
                    onChange={(e) => setUserForm({ ...userForm, is_simulated_threat: e.target.checked })} />
                }
                label="Flag as simulated threat (for demonstrations)"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setUserModalOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={saveUser} disabled={saving}>
              {saving ? 'Saving…' : editingUser ? 'Save changes' : 'Create user'}
            </Button>
          </DialogActions>
        </Dialog>

        {accessFor && (
          <EditAccessDialog
            open={Boolean(accessFor)}
            onClose={() => setAccessFor(null)}
            resourceId={accessFor.id}
            initialName={accessFor.name}
            initialPath={accessFor.path}
            onSaved={() => { loadResources(); setAccessFor(null); show('Access updated', 'success'); }}
          />
        )}

        <Snackbar open={toast.open} autoHideDuration={4000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          onClose={() => setToast({ ...toast, open: false })}>
          <Alert severity={toast.severity} variant="filled"
            onClose={() => setToast({ ...toast, open: false })}>
            {toast.msg}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

/** Small inline toggle used in the users table. */
function Switchish({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <Chip
      size="small"
      label={checked ? 'Yes' : 'No'}
      onClick={onToggle}
      sx={{
        cursor: 'pointer', fontSize: 11, fontWeight: 600,
        color: checked ? tokens.severity.high : tokens.textDim,
        background: checked ? `${tokens.severity.high}18` : tokens.surface,
        border: `1px solid ${checked ? `${tokens.severity.high}44` : tokens.hairline}`,
      }}
    />
  );
}
