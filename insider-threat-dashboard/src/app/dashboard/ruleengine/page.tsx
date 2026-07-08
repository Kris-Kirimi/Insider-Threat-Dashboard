
'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Tooltip,
  Snackbar,
  Alert,
  ThemeProvider,
  CssBaseline,
} from '@mui/material';
import { Edit, Delete, Add } from '@mui/icons-material';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import Sidebar from '../components/SideBar';
import FooterSection from '@/app/components/FooterSection';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { appTheme, appBackground } from '@/lib/theme';

// ===== Types & constants =====
type AccessLevel = 'none' | 'read' | 'write' | 'download';
const DEPARTMENTS = ['Finance', 'IT'];
const GROUPS = ['Interns', 'Regular Staff', 'Leads', 'Managers'];
const ACCESS_LEVELS: AccessLevel[] = ['none', 'read', 'write', 'download'];

// Default permissions helper
function emptyPermissions(): Record<string, AccessLevel> {
  return Object.fromEntries(GROUPS.map(g => [g, 'none'])) as Record<string, AccessLevel>;
}

// Convert permissions object to string
function permsToString(perms: Record<string, AccessLevel>): string {
  return Object.entries(perms)
    .filter(([_, level]) => level !== 'none')
    .map(([group, level]) => `${group}:${level}`)
    .join(',');
}

// Convert string to permissions object
function stringToPerms(str: string): Record<string, AccessLevel> {
  const base = emptyPermissions();
  if (!str) return base;
  str.split(',').forEach(pair => {
    const [group, level] = pair.split(':');
    if (group && level && ACCESS_LEVELS.includes(level as AccessLevel)) {
      base[group] = level as AccessLevel;
    }
  });
  return base;
}

// Summarize permissions for display
function summarizeAccess(perms: Record<string, AccessLevel>): string {
  const vals = Object.values(perms);
  if (vals.includes('download')) return 'download';
  if (vals.includes('write')) return 'write';
  if (vals.includes('read')) return 'read';
  return 'none';
}

// ===== Page component =====
// Add this at the top
function suggestPath(name: string, isFolder: boolean): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return isFolder ? `/folders/${slug}/` : `/files/${slug}.dat`;
}

export default function AccessControlPage() {
  const { data, error, mutate } = useSWR<any[]>('/resources/', apiGet);

  // Map API -> UI shape
  const resources = useMemo(() => {
    if (!data) return [];
    console.log('Raw API response:', data); // Debug log
    return data.map(r => {
      const perms = stringToPerms(r.permission_string ?? '');
      console.log('Parsed permissions for resource', r.id, ':', perms); // Debug log
      return {
        id: r.id,
        name: r.name,
        type: r.is_folder ? 'folder' : 'file',
        access: summarizeAccess(perms),
        department: r.department || (r.department_id ? DEPARTMENTS[r.department_id - 1] : ''),
        path: r.path || '',
        permissions: perms,
        raw: r,
      };
    });
  }, [data]);

  const resourcesByDepartment = useMemo(() => {
    return resources.reduce<Record<string, typeof resources[0][]>>((acc, file) => {
      if (!acc[file.department]) acc[file.department] = [];
      acc[file.department].push(file);
      return acc;
    }, {});
  }, [resources]);

  // Dialog state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'file' | 'folder'>('file');
  const [formDept, setFormDept] = useState('');
  const [formPath, setFormPath] = useState('');
  const [formPerms, setFormPerms] = useState<Record<string, AccessLevel>>(emptyPermissions());
  const [saving, setSaving] = useState(false);
  const [fetchingResource, setFetchingResource] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });

  // Open create dialog
  const openCreate = () => {
    setMode('create');
    setEditingId(null);
    setFormName('');
    setFormType('file');
    setFormDept('');
    setFormPath('');
    setFormPerms(emptyPermissions());
    setToast({ open: false, msg: '', severity: 'success' });
    setOpen(true);
  };

  // Open edit dialog
  const openEdit = async (file: any) => {
    setMode('edit');
    setEditingId(file.id);
    setFetchingResource(true);
    setToast({ open: false, msg: '', severity: 'success' });

    try {
      const detail = await apiGet(`/resources/${file.id}/`);
      console.log('Resource detail response:', detail); // Debug log
      setFormName(detail.name ?? file.name ?? '');
      setFormType(detail.is_folder ? 'folder' : 'file');
      setFormDept(detail.department ?? (detail.department_id ? DEPARTMENTS[detail.department_id - 1] : ''));
      setFormPath(detail.path ?? file.path ?? suggestPath(detail.name ?? file.name ?? '', detail.is_folder ?? file.type === 'folder'));
      const perms = stringToPerms(detail.permission_string ?? '');
      console.log('Parsed permissions from API:', perms); // Debug log
      setFormPerms(perms);
    } catch (e: any) {
      console.error('Failed to fetch resource detail:', e);
      setToast({ open: true, msg: parseApiError(e), severity: 'error' });
      // Fallback
      setFormName(file.name ?? '');
      setFormType(file.type ?? 'file');
      setFormDept(file.department ?? '');
      setFormPath(file.path ?? suggestPath(file.name ?? '', file.type === 'folder'));
      setFormPerms(stringToPerms(file.permission_string) || emptyPermissions());
    } finally {
      setFetchingResource(false);
      setOpen(true);
    }
  };

  // Parse backend error messages
  function parseApiError(e: any) {
    const msg = e?.message ?? String(e) ?? 'Unknown error';
    try {
      const parsed = JSON.parse(msg);
      if (typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(', ')}` : `${k}: ${String(v)}`))
          .join(' | ');
      }
    } catch {}
    return msg;
  }

  // Update one group's permission
  const updateGroupPerm = (group: string, level: AccessLevel) => {
    setFormPerms(prev => {
      const newPerms = { ...prev, [group]: level };
      console.log('Updated permissions in dialog:', newPerms); // Debug log
      return newPerms;
    });
  };

  // Save create/edit
  const handleSave = async () => {
    if (!formName.trim()) {
      setToast({ open: true, msg: 'Name is required.', severity: 'error' });
      return;
    }
    if (!formDept) {
      setToast({ open: true, msg: 'Department is required.', severity: 'error' });
      return;
    }
    const finalPath = formPath.trim() || suggestPath(formName, formType === 'folder');
    if (!finalPath) {
      setToast({ open: true, msg: 'Path is required.', severity: 'error' });
      return;
    }

    const payload = {
      name: formName.trim(),
      is_folder: formType === 'folder',
      path: finalPath,
      department_id: DEPARTMENTS.indexOf(formDept) + 1,
      permission_string: permsToString(formPerms),
    };
    console.log('Final payload before save:', payload); // Debug log

    try {
      setSaving(true);
      if (mode === 'create') {
        const response = await apiPost('/resources/', payload);
        console.log('Create response:', response); // Debug log
        setToast({ open: true, msg: 'Resource created successfully', severity: 'success' });
      } else if (mode === 'edit' && editingId != null) {
        const response = await apiPatch(`/resources/${editingId}/`, payload);
        console.log('Update response:', response); // Debug log
        setToast({ open: true, msg: 'Resource updated successfully', severity: 'success' });
      }
      setOpen(false);
      await mutate();
    } catch (e: any) {
      console.error('Save failed:', e);
      setToast({ open: true, msg: parseApiError(e), severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Delete resource
  const handleDelete = async (file: any) => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    try {
      await apiDelete(`/resources/${file.id}/`);
      setToast({ open: true, msg: 'Resource deleted successfully', severity: 'success' });
      await mutate();
    } catch (e: any) {
      console.error('Delete failed:', e);
      setToast({ open: true, msg: parseApiError(e), severity: 'error' });
    }
  };

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: appBackground }}>
        <AuthedTopBar />
        <Box sx={{ display: 'flex', flex: 1 }}>
          <Sidebar />
          <Box sx={{ flex: 1, p: { xs: 2, sm: 4 }, ml: { xs: 0, md: '240px' }, maxWidth: 1280 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h4">Access Control</Typography>
            <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
              Add Resource
            </Button>
          </Stack>

          <Typography variant="h5" mb={2}>Files</Typography>

          {!data && !error ? (
            <CircularProgress />
          ) : error ? (
            <Typography color="error">
              {error === '404' ? 'Resources not found. Check backend configuration.' : `Failed to load resources: ${error}`}
            </Typography>
          ) : Object.keys(resourcesByDepartment).length === 0 ? (
            <Typography>No files available.</Typography>
          ) : (
            Object.entries(resourcesByDepartment).map(([department, files]) => (
              <Box key={department} mb={4}>
                <Typography variant="h6" mb={1}>Department: {department}</Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Path</TableCell>
                        <TableCell>Access</TableCell>
                        <TableCell>Permissions</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {files.map((file: any) => (
                        <TableRow key={file.id}>
                          <TableCell>{file.name}</TableCell>
                          <TableCell>{file.type}</TableCell>
                          <TableCell>
                            <Tooltip title={file.path}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: 260 }}>
                                {file.path}
                              </span>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{file.access}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                              {GROUPS.map(g => (
                                <Chip
                                  key={g}
                                  size="small"
                                  label={`${g}: ${file.permissions[g] || 'none'}`}
                                  sx={{ mb: 0.5 }}
                                />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <IconButton onClick={() => openEdit(file)}>
                              <Edit />
                            </IconButton>
                            <IconButton onClick={() => handleDelete(file)}>
                              <Delete />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))
          )}
        </Box>
      </Box>
      <FooterSection />

      {/* Dialog */}
      <Dialog open={open} onClose={() => { if (!saving) setOpen(false); }} fullWidth maxWidth="md">
        <DialogTitle>{mode === 'create' ? 'Add New Resource' : 'Edit Resource'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {fetchingResource && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={20} />
                <Typography>Loading resource details...</Typography>
              </Box>
            )}

            <TextField
              label="Resource Name"
              value={formName}
              onChange={e => {
                setFormName(e.target.value);
                if (!formPath.trim()) setFormPath(suggestPath(e.target.value, formType === 'folder'));
              }}
              fullWidth
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formType}
                  label="Type"
                  onChange={e => {
                    const v = e.target.value as 'file' | 'folder';
                    setFormType(v);
                    if (!formPath.trim()) setFormPath(suggestPath(formName, v === 'folder'));
                  }}
                >
                  <MenuItem value="file">File</MenuItem>
                  <MenuItem value="folder">Folder</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Department</InputLabel>
                <Select
                  value={formDept}
                  label="Department"
                  onChange={e => setFormDept(e.target.value)}
                  disabled={mode === 'edit'}
                >
                  {DEPARTMENTS.map(d => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <TextField
              label="Path (required)"
              value={formPath}
              onChange={e => setFormPath(e.target.value)}
              helperText="Example: /files/report-q3.pdf or /folders/policies/"
              fullWidth
            />

            <Box>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Group Permissions</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Group</TableCell>
                    <TableCell>Permission</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {GROUPS.map(g => (
                    <TableRow key={g}>
                      <TableCell>{g}</TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={formPerms[g] || 'none'}
                            onChange={e => updateGroupPerm(g, e.target.value as AccessLevel)}
                          >
                            {ACCESS_LEVELS.map(a => (
                              <MenuItem key={a} value={a}>{a}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            {toast.open && (
              <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
                {toast.msg}
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving || fetchingResource}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || fetchingResource}
          >
            {saving ? <CircularProgress size={20} /> : mode === 'create' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open && !open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
