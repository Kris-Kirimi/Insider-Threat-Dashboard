'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Box, Typography, Button, TextField, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, InputAdornment, IconButton, Snackbar, Alert, Tooltip, CircularProgress,
  ThemeProvider, CssBaseline,
} from '@mui/material';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded';
import FolderOffRoundedIcon from '@mui/icons-material/FolderOffRounded';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import { apiGet, apiPost, apiDownload } from '@/lib/api';
import { ResourceDto, AccessLevel } from '@/types/resource';
import EditAccessDialog from '@/app/components/EditAccessDialog';
import { appTheme, appBackground, tokens, bezelShell, bezelCore } from '@/lib/theme';

type Toast = { open: boolean; msg: string; severity: 'success' | 'error' | 'info' };

const CAN_DOWNLOAD: AccessLevel[] = ['read', 'download', 'write', 'delete', 'full_control'];
const CAN_MANAGE: AccessLevel[] = ['full_control'];

function accessChip(access: AccessLevel): { label: string; color: string } {
  if (access === 'full_control') return { label: 'Full control', color: tokens.severity.low };
  if (access === 'none') return { label: 'No access', color: tokens.severity.critical };
  return { label: access.charAt(0).toUpperCase() + access.slice(1), color: tokens.severity.medium };
}

export default function DepartmentFilesPage({
  departmentName,
  departmentId,
  accent = tokens.accent,
}: {
  departmentName: string;
  departmentId: number;
  accent?: string;
}) {
  const { data, error, isLoading, mutate } = useSWR<ResourceDto[]>('/resources/', apiGet);

  const [searchTerm, setSearchTerm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newItem, setNewItem] = useState<{ name: string; type: 'file' | 'folder'; content: string }>(
    { name: '', type: 'file', content: '' },
  );
  const [preview, setPreview] = useState<{ open: boolean; title: string; body: string }>(
    { open: false, title: '', body: '' },
  );
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<ResourceDto | null>(null);
  const [toast, setToast] = useState<Toast>({ open: false, msg: '', severity: 'success' });
  const [busyId, setBusyId] = useState<number | null>(null);

  const showToast = (msg: string, severity: Toast['severity'] = 'info') =>
    setToast({ open: true, msg, severity });

  const files = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, searchTerm]);

  const stats = useMemo(() => {
    const all = data || [];
    return {
      total: all.length,
      accessible: all.filter((r) => r.access_for_current_user !== 'none').length,
      restricted: all.filter((r) => r.access_for_current_user === 'none').length,
    };
  }, [data]);

  async function handleCreate() {
    if (!newItem.name.trim()) return;
    try {
      await apiPost<ResourceDto>('/resources/', {
        name: newItem.name.trim(),
        is_folder: newItem.type === 'folder',
        department: departmentId,
        content: newItem.type === 'file' ? newItem.content : undefined,
      });
      setCreateOpen(false);
      setNewItem({ name: '', type: 'file', content: '' });
      showToast('Created successfully', 'success');
      mutate();
    } catch (e: any) {
      showToast(e?.message || 'Create failed', 'error');
    }
  }

  async function handleOpen(file: ResourceDto) {
    if (file.is_folder) return;
    try {
      const r = await apiGet<ResourceDto>(`/resources/${file.id}/`);
      setPreview({
        open: true,
        title: r.name,
        body:
          `Path: ${r.path}\nDepartment: ${r.department}\nCreated by: ${r.created_by ?? '—'}\n` +
          `Created: ${new Date(r.created_at).toLocaleString()}\nYour access: ${r.access_for_current_user}`,
      });
    } catch (e: any) {
      showToast(
        e?.status === 403 ? 'Access denied — you do not have rights to this file' : 'Could not open file',
        'error',
      );
    }
  }

  async function handleDownload(file: ResourceDto) {
    setBusyId(file.id);
    try {
      await apiDownload(`/resources/${file.id}/download/`, file.name);
      showToast(`Downloaded ${file.name}`, 'success');
    } catch (e: any) {
      showToast(
        e?.status === 403 ? 'You do not have permission to download this file' : 'Download failed',
        'error',
      );
    } finally {
      setBusyId(null);
    }
  }

  const stat = [
    { label: 'Total items', value: stats.total },
    { label: 'You can access', value: stats.accessible, color: tokens.severity.low },
    { label: 'Restricted', value: stats.restricted, color: tokens.severity.high },
  ];

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100dvh', background: appBackground, color: tokens.text, display: 'flex', flexDirection: 'column' }}>
        <AuthedTopBar accent={accent} />

        <Box sx={{ flexGrow: 1, px: { xs: 2, md: 4 }, py: { xs: 4, md: 6 }, maxWidth: 1120, mx: 'auto', width: '100%' }}>
          {/* Header */}
          <Box sx={{ animation: 'riseIn 600ms cubic-bezier(0.32,0.72,0,1) both' }}>
            <Chip
              label={departmentName}
              size="small"
              sx={{
                mb: 2, color: accent, background: tokens.accentDim,
                border: `1px solid ${accent}44`, fontWeight: 600,
                letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 10,
              }}
            />
            <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.6rem' } }}>
              Shared Files
            </Typography>
            <Typography sx={{ mt: 1.5, color: tokens.textDim, maxWidth: 560 }}>
              Every item is access-controlled. You can only open or download files your role permits —
              attempts on restricted files are logged.
            </Typography>
          </Box>

          {/* Stat row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr 1fr' }, gap: 1.5, mt: 4 }}>
            {stat.map((s, i) => (
              <Box key={s.label} sx={{ ...bezelShell, animation: `riseIn 600ms cubic-bezier(0.32,0.72,0,1) ${i * 80 + 80}ms both` }}>
                <Box sx={{ ...bezelCore, px: { xs: 2, md: 3 }, py: { xs: 1.75, md: 2.25 } }}>
                  <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 800, color: s.color || tokens.text, letterSpacing: '-0.02em' }}>
                    {s.value}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: tokens.textDim, mt: 0.25 }}>{s.label}</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Toolbar */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mt: 4, mb: 2.5 }}>
            <TextField
              placeholder="Search files and folders"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon sx={{ color: tokens.textFaint, fontSize: 20 }} />
                  </InputAdornment>
                ),
                sx: {
                  borderRadius: 999, color: tokens.text, background: tokens.surface,
                  '& fieldset': { borderColor: tokens.hairline },
                  '&:hover fieldset': { borderColor: tokens.hairlineStrong },
                },
              }}
              sx={{ flexGrow: 1, minWidth: 240, maxWidth: 440 }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="text" startIcon={<AddRoundedIcon />}
                onClick={() => { setNewItem({ name: '', type: 'file', content: '' }); setCreateOpen(true); }}
                sx={{ color: tokens.text, border: `1px solid ${tokens.hairline}`, '&:hover': { borderColor: accent, background: tokens.accentDim } }}
              >
                New file
              </Button>
              <Button
                variant="text" startIcon={<CreateNewFolderRoundedIcon />}
                onClick={() => { setNewItem({ name: '', type: 'folder', content: '' }); setCreateOpen(true); }}
                sx={{ color: tokens.text, border: `1px solid ${tokens.hairline}`, '&:hover': { borderColor: accent, background: tokens.accentDim } }}
              >
                New folder
              </Button>
            </Box>
          </Box>

          {/* States */}
          {error && (
            <Alert severity="error" sx={{ mb: 2, background: 'rgba(244,63,94,0.12)', border: `1px solid ${tokens.severity.critical}44`, color: tokens.text }}>
              Failed to load resources — are you signed in?
            </Alert>
          )}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress sx={{ color: accent }} />
            </Box>
          )}
          {!isLoading && files.length === 0 && !error && (
            <Box sx={{ ...bezelShell }}>
              <Box sx={{ ...bezelCore, py: 8, textAlign: 'center' }}>
                <FolderOffRoundedIcon sx={{ fontSize: 40, color: tokens.textFaint, mb: 1 }} />
                <Typography sx={{ color: tokens.textDim }}>
                  {searchTerm ? 'No files match your search.' : 'No files yet. Create one to get started.'}
                </Typography>
              </Box>
            </Box>
          )}

          {/* File list */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {files.map((file, i) => {
              const access = file.access_for_current_user;
              const chip = accessChip(access);
              const locked = access === 'none';
              const canDownload = !file.is_folder && CAN_DOWNLOAD.includes(access);
              const canManage = CAN_MANAGE.includes(access);
              return (
                <Box
                  key={file.id}
                  onClick={() => handleOpen(file)}
                  sx={{
                    ...bezelShell,
                    animation: `riseIn 500ms cubic-bezier(0.32,0.72,0,1) ${Math.min(i, 8) * 45}ms both`,
                    cursor: file.is_folder ? 'default' : 'pointer',
                    transition: 'transform 200ms cubic-bezier(0.32,0.72,0,1), border-color 200ms',
                    '&:hover': { transform: file.is_folder ? 'none' : 'translateY(-2px)', borderColor: locked ? tokens.hairline : `${accent}55` },
                  }}
                >
                  <Box sx={{ ...bezelCore, display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5 }}>
                    {/* Icon tile */}
                    <Box
                      sx={{
                        width: 42, height: 42, borderRadius: '12px', flexShrink: 0,
                        display: 'grid', placeItems: 'center',
                        background: locked ? 'rgba(255,255,255,0.04)' : tokens.accentDim,
                        border: `1px solid ${locked ? tokens.hairline : `${accent}33`}`,
                        color: locked ? tokens.textFaint : accent,
                      }}
                    >
                      {file.is_folder ? <FolderRoundedIcon /> : <InsertDriveFileRoundedIcon />}
                    </Box>

                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 600, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: tokens.textFaint }}>
                        {file.is_folder ? 'Folder' : 'File'} · {file.department}
                      </Typography>
                    </Box>

                    <Chip
                      label={chip.label}
                      size="small"
                      sx={{
                        color: chip.color, background: `${chip.color}18`,
                        border: `1px solid ${chip.color}44`, fontWeight: 600, fontSize: 11,
                      }}
                    />

                    {canManage && (
                      <Tooltip title="Manage access">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); setSelected(file); setEditOpen(true); }}
                          sx={{ color: tokens.textDim, '&:hover': { color: accent } }}
                        >
                          <TuneRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

                    {!file.is_folder && (canDownload ? (
                      <Tooltip title="Download">
                        <span>
                          <IconButton
                            size="small" disabled={busyId === file.id}
                            onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                            sx={{ color: accent }}
                          >
                            {busyId === file.id ? <CircularProgress size={16} sx={{ color: accent }} /> : <DownloadRoundedIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip title="You do not have permission to download this file">
                        <span>
                          <IconButton size="small" disabled sx={{ color: tokens.textFaint }}>
                            <LockRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      {selected && (
        <EditAccessDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          resourceId={selected.id}
          initialName={selected.name}
          initialPath={selected.path}
          onSaved={() => { mutate(); setEditOpen(false); showToast('Access updated', 'success'); }}
        />
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { background: tokens.surfaceSolid, border: `1px solid ${tokens.hairline}`, borderRadius: 3, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>New {newItem.type === 'folder' ? 'folder' : 'file'}</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          {newItem.type === 'file' && (
            <TextField label="Content" fullWidth multiline rows={5} value={newItem.content}
              placeholder="Text content for this file (optional)"
              onChange={(e) => setNewItem({ ...newItem, content: e.target.value })} />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ color: tokens.textDim }}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" sx={{ background: accent, color: '#05070d', '&:hover': { background: accent } }}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={preview.open} onClose={() => setPreview({ ...preview, open: false })} fullWidth maxWidth="sm"
        PaperProps={{ sx: { background: tokens.surfaceSolid, border: `1px solid ${tokens.hairline}`, borderRadius: 3, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{preview.title}</DialogTitle>
        <DialogContent dividers sx={{ borderColor: tokens.hairline, minHeight: 100 }}>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', color: tokens.textDim, lineHeight: 1.7 }}>
            {preview.body}
          </pre>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPreview({ ...preview, open: false })} sx={{ color: tokens.textDim }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
