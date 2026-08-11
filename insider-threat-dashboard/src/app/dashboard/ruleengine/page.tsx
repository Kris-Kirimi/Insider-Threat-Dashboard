'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Snackbar, Alert, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, ThemeProvider,
  Tooltip, Typography, CssBaseline, MenuItem,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import Sidebar from '../components/SideBar';
import EditAccessDialog from '@/app/components/EditAccessDialog';
import UploadResourceButton from '@/app/components/UploadResourceButton';
import FooterSection from '@/app/components/FooterSection';
import { apiGet, apiPost, apiPatch, apiDelete, apiDownload } from '@/lib/api';
import { ResourceDto, AccessLevel, can } from '@/types/resource';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

type Toast = { open: boolean; msg: string; severity: 'success' | 'error' | 'info' };
type Dept = { id: number; name: string };

function accessColor(access: AccessLevel): string {
  if (access === 'full_control') return tokens.severity.low;
  if (access === 'none') return tokens.severity.critical;
  return tokens.severity.medium;
}

export default function AccessControlPage() {
  const { data, error, isLoading, mutate } = useSWR<ResourceDto[]>('/resources/', apiGet);
  const { data: depts } = useSWR<Dept[]>('/departments/', apiGet);

  const [toast, setToast] = useState<Toast>({ open: false, msg: '', severity: 'info' });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'file' as 'file' | 'folder', content: '' });
  const [saving, setSaving] = useState(false);

  const [accessFor, setAccessFor] = useState<ResourceDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [uploadDept, setUploadDept] = useState<string>('');

  const show = (msg: string, severity: Toast['severity'] = 'info') =>
    setToast({ open: true, msg, severity });

  const byDepartment = useMemo(() => {
    const groups: Record<string, ResourceDto[]> = {};
    (data || []).forEach((r) => {
      (groups[r.department] ||= []).push(r);
    });
    return groups;
  }, [data]);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      // department is set server-side from the caller's own department, and
      // `path` is read-only -- the file's bytes come from `content` (or from
      // the upload button for real files).
      await apiPost<ResourceDto>('/resources/', {
        name: form.name.trim(),
        is_folder: form.type === 'folder',
        content: form.type === 'file' ? form.content : undefined,
      });
      setCreateOpen(false);
      setForm({ name: '', type: 'file', content: '' });
      show('Created', 'success');
      mutate();
    } catch (e: any) {
      show(e?.message || 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(resource: ResourceDto) {
    const next = window.prompt('New name', resource.name);
    if (!next || next === resource.name) return;
    try {
      await apiPatch(`/resources/${resource.id}/`, { name: next });
      show('Renamed', 'success');
      mutate();
    } catch (e: any) {
      show(e?.status === 403 ? 'You cannot rename this file' : 'Rename failed', 'error');
    }
  }

  async function handleDelete(resource: ResourceDto) {
    if (!window.confirm(`Delete ${resource.name}?`)) return;
    try {
      await apiDelete(`/resources/${resource.id}/`);
      show('Deleted', 'success');
      mutate();
    } catch (e: any) {
      show(e?.status === 403 ? 'You cannot delete this file' : 'Delete failed', 'error');
    }
  }

  async function handleDownload(resource: ResourceDto) {
    setBusyId(resource.id);
    try {
      await apiDownload(`/resources/${resource.id}/download/`, resource.name);
    } catch (e: any) {
      show(e?.status === 403
        ? 'You do not have download permission for this file'
        : 'Download failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

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
                Access control
              </Typography>
              <Typography variant="h4">Files &amp; permissions</Typography>
              <Typography sx={{ mt: 1, color: tokens.textDim, maxWidth: 640 }}>
                Upload a real file, then grant each role or person the access they need.
                Permissions take effect immediately — a person with read-only access can
                open a file but cannot download it.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 3, mb: 3, alignItems: 'center' }}>
              <TextField
                select size="small" label="Upload into" value={uploadDept}
                onChange={(e) => setUploadDept(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">My department</MenuItem>
                {(depts || []).map((d) => (
                  <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>
                ))}
              </TextField>

              <UploadResourceButton
                department={uploadDept || undefined}
                onUploaded={(created) => {
                  mutate();
                  setAccessFor(created);      // straight into "who may use this?"
                  show(`Uploaded ${created.name} — now set who can use it`, 'success');
                }}
                onError={(msg) => show(msg, 'error')}
              />

              <Button
                startIcon={<AddRoundedIcon />}
                onClick={() => { setForm({ name: '', type: 'file', content: '' }); setCreateOpen(true); }}
                sx={{ color: tokens.text, border: `1px solid ${tokens.hairline}`, '&:hover': { borderColor: tokens.accent } }}
              >
                New text file / folder
              </Button>
            </Stack>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>Failed to load resources.</Alert>
            )}
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress sx={{ color: tokens.accent }} />
              </Box>
            )}

            {Object.entries(byDepartment).map(([department, files]) => (
              <Box key={department} sx={{ mb: 4 }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>{department}</Typography>
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
                              <TableCell sx={{ color: tokens.text }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  {file.is_folder
                                    ? <FolderRoundedIcon sx={{ fontSize: 18, color: tokens.textDim }} />
                                    : <InsertDriveFileRoundedIcon sx={{ fontSize: 18, color: tokens.textDim }} />}
                                  <span>{file.name}</span>
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ color: tokens.textDim }}>
                                {file.is_folder ? 'Folder' : 'File'}
                              </TableCell>
                              <TableCell sx={{ color: tokens.textDim }}>{file.created_by ?? '—'}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small" label={access.replace('_', ' ')}
                                  sx={{
                                    color: accessColor(access),
                                    background: `${accessColor(access)}18`,
                                    border: `1px solid ${accessColor(access)}44`,
                                    fontWeight: 600, fontSize: 11,
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={0.5}>
                                  {can(access, 'delete') && (
                                    <Tooltip title="Manage access">
                                      <IconButton size="small" sx={{ color: tokens.accent }}
                                        onClick={() => setAccessFor(file)}>
                                        <TuneRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  {!file.is_folder && (can(access, 'download') ? (
                                    <Tooltip title="Download">
                                      <span>
                                        <IconButton size="small" disabled={busyId === file.id}
                                          sx={{ color: tokens.accent }}
                                          onClick={() => handleDownload(file)}>
                                          {busyId === file.id
                                            ? <CircularProgress size={16} />
                                            : <DownloadRoundedIcon fontSize="small" />}
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title="Read-only: you cannot download this file">
                                      <span>
                                        <IconButton size="small" disabled>
                                          <LockRoundedIcon fontSize="small" sx={{ color: tokens.textFaint }} />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  ))}
                                  {can(access, 'write') && (
                                    <Button size="small" sx={{ color: tokens.textDim, minWidth: 0 }}
                                      onClick={() => handleRename(file)}>
                                      Rename
                                    </Button>
                                  )}
                                  {can(access, 'delete') && (
                                    <Tooltip title="Delete">
                                      <IconButton size="small" sx={{ color: tokens.severity.critical }}
                                        onClick={() => handleDelete(file)}>
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

            {!isLoading && !error && Object.keys(byDepartment).length === 0 && (
              <Typography sx={{ color: tokens.textFaint, textAlign: 'center', py: 6 }}>
                No files yet. Upload one to get started.
              </Typography>
            )}

            <FooterSection />
          </Container>
        </Box>

        {accessFor && (
          <EditAccessDialog
            open={Boolean(accessFor)}
            onClose={() => setAccessFor(null)}
            resourceId={accessFor.id}
            initialName={accessFor.name}
            initialPath={accessFor.path}
            onSaved={() => { mutate(); setAccessFor(null); show('Access updated', 'success'); }}
          />
        )}

        <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>New {form.type === 'folder' ? 'folder' : 'text file'}</DialogTitle>
          <DialogContent>
            <TextField fullWidth label="Name" value={form.name} sx={{ mt: 1, mb: 2 }}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField select fullWidth label="Type" value={form.type} sx={{ mb: 2 }}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'file' | 'folder' })}>
              <MenuItem value="file">File</MenuItem>
              <MenuItem value="folder">Folder</MenuItem>
            </TextField>
            {form.type === 'file' && (
              <TextField fullWidth multiline rows={5} label="Content"
                placeholder="Text content. To upload a real document, use Upload file instead."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })} />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

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
