'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Checkbox,
  FormControlLabel,
  Avatar,
  ListItem,
  Select,
  MenuItem,
  Chip,
  Container,
  ThemeProvider,
  CssBaseline,
} from '@mui/material';
import { Edit, Delete, Person, KeyboardArrowLeft, Close, Add } from '@mui/icons-material';
import { SelectChangeEvent } from '@mui/material/Select';
import { useRouter } from 'next/navigation';
import AuthedTopBar from '@/app/components/AuthedTopBar';
import Sidebar from '../components/SideBar';
import { appTheme, appBackground } from '@/lib/theme';

interface User {
  id: number;
  email: string;
  full_name: string;
  department?: string | null;
  group?: string | null;
  is_simulated_threat: boolean;
}

interface Resource {
  id: number;
  name: string;
  path: string | null;
  is_folder: boolean;
  department: string;
  access_level: string;
}

interface Group {
  id: number;
  name: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

// Helper function to get cookie value
function getCookie(name: string) {
  let cookieValue = null;
  if (typeof document !== 'undefined' && document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// Helper function to make authenticated requests with CSRF protection
async function makeRequest(url: string, options: RequestInit = {}) {
  await fetch(`${API_BASE}/api/csrf/`, {
    credentials: 'include',
  });

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('X-CSRFToken')) {
    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
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

export default function AdminTabsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'add' | 'edit'>('add');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    email: '',
    full_name: '',
    department: '',
    group: '',
    password: '',
    is_simulated_threat: false,
  });
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [fileModalMode, setFileModalMode] = useState<'add' | 'edit'>('add');
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [fileFormData, setFileFormData] = useState({
    name: '',
    department: '',
    access_level: '',
    is_folder: false,
  });
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [updateSetting, setUpdateSetting] = useState<string>('');
  const [updateValue, setUpdateValue] = useState<string | boolean>('');
  const token = useMemo(() => typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null, []);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;

    async function fetchGroups() {
      try {
        const res = await makeRequest(`${API_BASE}/api/groups/`);
        if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
        const data = await res.json();
        setGroups(data);
      } catch (e) {}
    }
    fetchGroups();
  }, [token]);

  const fetchUsers = async () => {
    if (!token) {
      setUsersError('You are not logged in.');
      return;
    }
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await makeRequest(`${API_BASE}/api/users/`);
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setUsers(data);
    } catch (e: any) {
      setUsersError(e.message || 'Failed to fetch users.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchFiles = async () => {
    if (!token) {
      setFilesError('You are not logged in.');
      return;
    }
    setFilesLoading(true);
    setFilesError('');
    try {
      const res = await makeRequest(`${API_BASE}/api/department_resources/`);
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setResources(data);
    } catch (e: any) {
      setFilesError(e.message || 'Failed to fetch resources.');
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [token]);

  const handleLogout = async () => {
    try {
      await makeRequest(`${API_BASE}/api/logout/`, {
        method: 'POST',
      });
      localStorage.removeItem('accessToken');
      document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = 'sessionid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      localStorage.removeItem('accessToken');
      document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = 'sessionid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      router.push('/login');
    }
  };

  const filteredUsers = users.filter(
    u => u.email.toLowerCase().includes(searchTerm.toLowerCase()) || (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToSelected = (user: User) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const removeSelected = (user: User) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
  };

  const openUserAddModal = () => {
    setUserModalMode('add');
    setEditingUser(null);
    setUserFormData({ email: '', full_name: '', department: '', group: '', password: '', is_simulated_threat: false });
    setUserModalOpen(true);
  };

  const openUserEditModal = (user: User) => {
    setUserModalMode('edit');
    setEditingUser(user);
    setUserFormData({
      email: user.email,
      full_name: user.full_name || '',
      department: user.department || '',
      group: user.group || '',
      password: '',
      is_simulated_threat: user.is_simulated_threat,
    });
    setUserModalOpen(true);
  };

  const closeUserModal = () => {
    setUserModalOpen(false);
    setUsersError('');
  };

  const handleUserInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    const { name, value } = e.target as any;
    setUserFormData({ ...userFormData, [name]: value });
    setUsersError('');
  };

  const handleUserCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setUserFormData({ ...userFormData, [name]: checked });
  };

  const handleSaveUser = async () => {
    if (!userFormData.email || !userFormData.full_name || !userFormData.department || !userFormData.group) {
      setUsersError('Email, full name, department, and group are required.');
      return;
    }
    if (userModalMode === 'add' && !userFormData.password) {
      setUsersError('Password is required for new users.');
      return;
    }

    setSaving(true);
    setUsersError('');
    try {
      let res;
      const payload: any = {
        email: userFormData.email,
        full_name: userFormData.full_name,
        department: userFormData.department || null,
        group: userFormData.group || null,
        is_simulated_threat: userFormData.is_simulated_threat,
      };
      if (userModalMode === 'add') {
        payload.password = userFormData.password;
        res = await makeRequest(`${API_BASE}/api/users/`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else if (userModalMode === 'edit' && editingUser) {
        if (userFormData.password) {
          payload.password = userFormData.password;
        }
        res = await makeRequest(`${API_BASE}/api/users/${editingUser.id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      if (!res || !res.ok) {
        const errData = await res?.json();
        throw new Error(errData?.detail || 'Failed to save user');
      }
      await fetchUsers();
      closeUserModal();
    } catch (e: any) {
      setUsersError(e.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.email}? This action cannot be undone.`)) return;
    if (!token) return setUsersError('You are not logged in.');

    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await makeRequest(`${API_BASE}/api/users/${user.id}/`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.detail || 'Failed to delete user');
      }
      await fetchUsers();
    } catch (e: any) {
      setUsersError(e.message || 'Failed to delete user');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleApplySettings = async () => {
    if (!updateSetting || selectedUsers.length === 0) return;
    setSaving(true);
    setUsersError('');
    try {
      for (const user of selectedUsers) {
        const payload: any = {
          [updateSetting]: updateSetting === 'is_simulated_threat' ? !!updateValue : updateValue,
        };
        const res = await makeRequest(`${API_BASE}/api/users/${user.id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData?.detail || 'Failed to update user');
        }
      }
      await fetchUsers();
      setSelectedUsers([]);
      setUpdateSetting('');
      setUpdateValue('');
    } catch (e: any) {
      setUsersError(e.message || 'Failed to apply settings');
    } finally {
      setSaving(false);
    }
  };

  const openAddFileModal = (department: string) => {
    setFileModalMode('add');
    setEditingResource(null);
    setFileFormData({ name: '', department: department, access_level: '', is_folder: false });
    setFileModalOpen(true);
  };

  const openEditFileModal = (resource: Resource) => {
    setFileModalMode('edit');
    setEditingResource(resource);
    setFileFormData({
      name: resource.name,
      department: resource.department,
      access_level: resource.access_level,
      is_folder: resource.is_folder,
    });
    setFileModalOpen(true);
  };

  const closeFileModal = () => {
    setFileModalOpen(false);
    setFilesError('');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement> | SelectChangeEvent<string>) => {
    const { name, value } = e.target as any;
    setFileFormData({ ...fileFormData, [name]: value });
    setFilesError('');
  };

  const handleFileCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFileFormData({ ...fileFormData, [name]: checked });
  };

  const handleAddFile = async () => {
    if (!fileFormData.name || !fileFormData.department || !fileFormData.access_level) {
      setFilesError('Name, department, and access level are required.');
      return;
    }
    setSaving(true);
    setFilesError('');
    try {
      const payload = {
        name: fileFormData.name,
        path: null,
        is_folder: fileFormData.is_folder,
        department: fileFormData.department,
        access_level: fileFormData.access_level,
      };
      const res = await makeRequest(`${API_BASE}/api/department_resources/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.detail || 'Failed to add resource');
      }
      await fetchFiles();
      closeFileModal();
    } catch (e: any) {
      setFilesError(e.message || 'Failed to add resource');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFile = async () => {
    if (!fileFormData.name || !fileFormData.access_level) {
      setFilesError('Name and access level are required.');
      return;
    }
    if (!editingResource) return;
    setSaving(true);
    setFilesError('');
    try {
      const payload = {
        name: fileFormData.name,
        path: null,
        is_folder: fileFormData.is_folder,
        department: fileFormData.department,
        access_level: fileFormData.access_level,
      };
      const res = await makeRequest(`${API_BASE}/api/department_resources/${editingResource.id}/`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.detail || 'Failed to update resource');
      }
      await fetchFiles();
      closeFileModal();
    } catch (e: any) {
      setFilesError(e.message || 'Failed to update resource');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFile = async (resource: Resource) => {
    if (!confirm(`Are you sure you want to delete ${resource.name}? This action cannot be undone.`)) return;
    setFilesLoading(true);
    setFilesError('');
    try {
      const res = await makeRequest(`${API_BASE}/api/department_resources/${resource.id}/`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.detail || 'Failed to delete resource');
      }
      await fetchFiles();
    } catch (e: any) {
      setFilesError(e.message || 'Failed to delete resource');
    } finally {
      setFilesLoading(false);
    }
  };

  const resourcesByDepartment = resources.reduce<Record<string, Resource[]>>((acc, resource) => {
    if (!acc[resource.department]) acc[resource.department] = [];
    acc[resource.department].push(resource);
    return acc;
  }, {});

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography
              variant="h4"
              sx={{
                color: '#00bcd4',
                fontWeight: 'bold',
                textAlign: { xs: 'center', sm: 'left' },
                fontSize: { xs: '1.8rem', sm: '2.5rem' },
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              }}
            >
              Admin Management
            </Typography>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleLogout}
              sx={{
                borderRadius: 2,
                px: 3,
                '&:hover': { background: '#d32f2f' },
              }}
            >
              Log Out
            </Button>
          </Box>

          {usersLoading ? (
            <Box sx={{ textAlign: 'center', mt: 5 }}>
              <CircularProgress sx={{ color: '#00bcd4' }} />
            </Box>
          ) : usersError ? (
            <Typography color="error" sx={{ mb: 2, background: 'rgba(244, 67, 54, 0.2)', p: 2, borderRadius: 2 }}>
              {usersError}
            </Typography>
          ) : (
            <Stack spacing={4}>
              <Paper
                elevation={6}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: 'rgba(31, 44, 62, 0.9)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(0, 188, 212, 0.2)',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" sx={{ color: '#00bcd4', fontWeight: 'bold' }}>
                    Select Users
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<Add />}
                    onClick={openUserAddModal}
                    sx={{ borderRadius: 2 }}
                  >
                    Add User
                  </Button>
                </Stack>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid rgba(0, 188, 212, 0.5)',
                    borderRadius: 2,
                    p: 0.5,
                    mb: 2,
                    background: 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <IconButton size="small" sx={{ color: '#00bcd4' }}>
                    <KeyboardArrowLeft />
                  </IconButton>
                  <TextField
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    variant="standard"
                    InputProps={{ disableUnderline: true }}
                    sx={{ flex: 1, mx: 1, color: '#fff', input: { color: '#fff' } }}
                    placeholder="Search by email or name"
                  />
                  <IconButton size="small" onClick={() => setSearchTerm('')} sx={{ color: '#00bcd4' }}>
                    <Close />
                  </IconButton>
                </Box>
                <Stack spacing={0} sx={{ mb: 2, maxHeight: 200, overflowY: 'auto' }}>
                  {filteredUsers.length === 0 ? (
                    <Typography sx={{ color: '#bbb', textAlign: 'center', py: 2 }}>
                      No users found
                    </Typography>
                  ) : (
                    filteredUsers.map(user => (
                      <ListItem
                        key={user.id}
                        button
                        onClick={() => addToSelected(user)}
                        sx={{
                          py: 1,
                          '&:hover': { background: 'rgba(0, 188, 212, 0.2)' },
                          transition: 'background 0.3s',
                        }}
                      >
                        <Avatar sx={{ bgcolor: '#00bcd4', mr: 2 }}>
                          <Person />
                        </Avatar>
                        <Typography sx={{ color: '#fff' }}>{user.full_name}</Typography>
                      </ListItem>
                    ))
                  )}
                </Stack>
                <Typography variant="body2" sx={{ color: '#00bcd4', mb: 1, fontWeight: 'bold' }}>
                  Selected Users:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                  {selectedUsers.length === 0 ? (
                    <Typography sx={{ color: '#bbb' }}>No users selected</Typography>
                  ) : (
                    selectedUsers.map(user => (
                      <Chip
                        key={user.id}
                        label={user.full_name}
                        onDelete={() => removeSelected(user)}
                        sx={{
                          borderColor: '#00bcd4',
                          color: '#fff',
                          background: 'rgba(0, 188, 212, 0.2)',
                          '&:hover': { background: 'rgba(0, 188, 212, 0.3)' },
                        }}
                      />
                    ))
                  )}
                </Stack>
              </Paper>

              <Paper
                elevation={6}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: 'rgba(31, 44, 62, 0.9)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(0, 188, 212, 0.2)',
                }}
              >
                <Typography variant="h6" sx={{ color: '#00bcd4', fontWeight: 'bold', mb: 2 }}>
                  Update User Settings
                </Typography>
                <Select
                  value={updateSetting}
                  onChange={(e) => setUpdateSetting(e.target.value as string)}
                  displayEmpty
                  fullWidth
                  sx={{
                    mb: 2,
                    color: '#fff',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00bcd4' },
                    '.MuiSvgIcon-root': { color: '#fff' },
                  }}
                >
                  <MenuItem value="" disabled>
                    Choose Setting
                  </MenuItem>
                  <MenuItem value="department">Department</MenuItem>
                  <MenuItem value="group">Group</MenuItem>
                  <MenuItem value="is_simulated_threat">Simulated Threat</MenuItem>
                </Select>
                {updateSetting && (
                  <Box sx={{ mb: 2 }}>
                    {updateSetting === 'department' && (
                      <Select
                        value={updateValue as string}
                        onChange={(e) => setUpdateValue(e.target.value as string)}
                        fullWidth
                        sx={{
                          color: '#fff',
                          '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00bcd4' },
                          '.MuiSvgIcon-root': { color: '#fff' },
                        }}
                      >
                        <MenuItem value="IT">IT</MenuItem>
                        <MenuItem value="Finance">Finance</MenuItem>
                      </Select>
                    )}
                    {updateSetting === 'group' && (
                      <Select
                        value={updateValue as string}
                        onChange={(e) => setUpdateValue(e.target.value as string)}
                        fullWidth
                        sx={{
                          color: '#fff',
                          '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00bcd4' },
                          '.MuiSvgIcon-root': { color: '#fff' },
                        }}
                      >
                        <MenuItem value="intern">Intern</MenuItem>
                        <MenuItem value="Regular Staff">Regular Staff</MenuItem>
                        <MenuItem value="Department Leads">Department Leads</MenuItem>
                        <MenuItem value="Managers">Managers</MenuItem>
                      </Select>
                    )}
                    {updateSetting === 'is_simulated_threat' && (
                      <FormControlLabel
                        control={<Checkbox checked={!!updateValue} onChange={(e) => setUpdateValue(e.target.checked)} />}
                        label="Simulate Insider Threat"
                        sx={{ color: '#fff' }}
                      />
                    )}
                  </Box>
                )}
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleApplySettings}
                  disabled={saving || selectedUsers.length === 0 || !updateSetting || !updateValue}
                  sx={{ borderRadius: 2 }}
                >
                  Apply Settings
                </Button>
              </Paper>

              <Paper
                elevation={6}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: 'rgba(31, 44, 62, 0.9)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(0, 188, 212, 0.2)',
                }}
              >
                <Typography variant="h6" sx={{ color: '#00bcd4', fontWeight: 'bold', mb: 2 }}>
                  Users Data
                </Typography>
                <TableContainer sx={{ maxHeight: 300, borderRadius: 2, overflow: 'hidden' }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#00bcd4' }}>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Email</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Full Name</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Department</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Group</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Simulated Threat</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 'bold', textAlign: 'right' }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ color: '#bbb' }}>
                            No users found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredUsers.map(user => (
                          <TableRow
                            key={user.id}
                            hover
                            sx={{
                              '&:hover': { background: 'rgba(0, 188, 212, 0.2)' },
                              transition: 'background 0.3s',
                            }}
                          >
                            <TableCell sx={{ color: '#fff' }}>{user.email}</TableCell>
                            <TableCell sx={{ color: '#fff' }}>{user.full_name}</TableCell>
                            <TableCell sx={{ color: '#fff' }}>{user.department || '-'}</TableCell>
                            <TableCell sx={{ color: '#fff' }}>{user.group || '-'}</TableCell>
                            <TableCell sx={{ color: '#fff' }}>{user.is_simulated_threat ? 'Yes' : 'No'}</TableCell>
                            <TableCell sx={{ textAlign: 'right' }}>
                              <IconButton
                                color="primary"
                                onClick={() => openUserEditModal(user)}
                                size="small"
                                aria-label="edit user"
                                sx={{ '&:hover': { background: 'rgba(0, 188, 212, 0.3)' } }}
                              >
                                <Edit />
                              </IconButton>
                              <IconButton
                                color="error"
                                onClick={() => handleDeleteUser(user)}
                                size="small"
                                aria-label="delete user"
                                sx={{ '&:hover': { background: 'rgba(244, 67, 54, 0.3)' } }}
                              >
                                <Delete />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper
                elevation={6}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: 'rgba(31, 44, 62, 0.9)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(0, 188, 212, 0.2)',
                }}
              >
               
                {filesLoading ? (
                  <Box sx={{ textAlign: 'center', mt: 5 }}>
                    <CircularProgress sx={{ color: '#00bcd4' }} />
                  </Box>
                ) : filesError ? (
                  <Typography color="error" sx={{ mb: 2, background: 'rgba(244, 67, 54, 0.2)', p: 2, borderRadius: 2 }}>
                    {filesError}
                  </Typography>
                ) : Object.keys(resourcesByDepartment).length === 0 ? (
                  <Typography sx={{ color: '#bbb' }}>No files available.</Typography>
                ) : (
                  Object.entries(resourcesByDepartment).map(([department, files]) => (
                    <Box key={department} mb={3}>
                      <Typography variant="subtitle1" sx={{ color: '#00bcd4', fontWeight: 'bold', mb: 2 }}>
                        Department: {department}
                      </Typography>
                      <TableContainer sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow sx={{ bgcolor: '#00bcd4' }}>
                              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Name</TableCell>
                              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Type</TableCell>
                              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Access Level</TableCell>
                              <TableCell sx={{ color: '#fff', fontWeight: 'bold', textAlign: 'right' }}>Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {files.map(file => (
                              <TableRow
                                key={file.id}
                                hover
                                sx={{
                                  '&:hover': { background: 'rgba(0, 188, 212, 0.2)' },
                                  transition: 'background 0.3s',
                                }}
                              >
                                <TableCell sx={{ color: '#fff' }}>{file.name}</TableCell>
                                <TableCell sx={{ color: '#fff' }}>{file.is_folder ? 'Folder' : 'File'}</TableCell>
                                <TableCell sx={{ color: '#fff' }}>{file.access_level}</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>
                                  <IconButton
                                    color="primary"
                                    onClick={() => openEditFileModal(file)}
                                    size="small"
                                    aria-label="edit file"
                                    sx={{ '&:hover': { background: 'rgba(0, 188, 212, 0.3)' } }}
                                  >
                                    <Edit />
                                  </IconButton>
                                  <IconButton
                                    color="error"
                                    onClick={() => handleDeleteFile(file)}
                                    size="small"
                                    aria-label="delete file"
                                    sx={{ '&:hover': { background: 'rgba(244, 67, 54, 0.3)' } }}
                                  >
                                    <Delete />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => openAddFileModal(department)}
                        sx={{ mt: 2, borderRadius: 2 }}
                      >
                        Add Resource
                      </Button>
                    </Box>
                  ))
                )}
              </Paper>
            </Stack>
          )}

          {/* User Modal */}
          <Dialog
            open={userModalOpen}
            onClose={closeUserModal}
            maxWidth="sm"
            fullWidth
            sx={{
              '& .MuiDialog-paper': {
                background: 'rgba(31, 44, 62, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                border: '1px solid rgba(0, 188, 212, 0.3)',
                color: '#fff',
              },
            }}
          >
            <DialogTitle sx={{ color: '#00bcd4', fontWeight: 'bold' }}>
              {userModalMode === 'add' ? 'Add New User' : `Edit User: ${editingUser?.email}`}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2} mt={1}>
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  fullWidth
                  value={userFormData.email}
                  onChange={handleUserInputChange}
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                      '&:hover fieldset': { borderColor: '#00bcd4' },
                      '&.Mui-focused fieldset': { borderColor: '#00bcd4' },
                    },
                    '& .MuiInputLabel-root': { color: '#bbb', '&.Mui-focused': { color: '#00bcd4' } },
                  }}
                />
                <TextField
                  label="Full Name"
                  name="full_name"
                  fullWidth
                  value={userFormData.full_name}
                  onChange={handleUserInputChange}
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                      '&:hover fieldset': { borderColor: '#00bcd4' },
                      '&.Mui-focused fieldset': { borderColor: '#00bcd4' },
                    },
                    '& .MuiInputLabel-root': { color: '#bbb', '&.Mui-focused': { color: '#00bcd4' } },
                  }}
                />
                <Select
                  label="Department"
                  name="department"
                  value={userFormData.department}
                  onChange={handleUserInputChange as (e: SelectChangeEvent<string>) => void}
                  fullWidth
                  required
                  sx={{
                    color: '#fff',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00bcd4' },
                    '.MuiSvgIcon-root': { color: '#fff' },
                  }}
                >
                  <MenuItem value="">Select Department</MenuItem>
                  <MenuItem value="IT">IT</MenuItem>
                  <MenuItem value="Finance">Finance</MenuItem>
                </Select>
                <Select
                  label="Group"
                  name="group"
                  value={userFormData.group}
                  onChange={handleUserInputChange as (e: SelectChangeEvent<string>) => void}
                  fullWidth
                  required
                  sx={{
                    color: '#fff',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00bcd4' },
                    '.MuiSvgIcon-root': { color: '#fff' },
                  }}
                >
                  <MenuItem value="">Select Group</MenuItem>
                  <MenuItem value="intern">Intern</MenuItem>
                  <MenuItem value="Regular Staff">Regular Staff</MenuItem>
                  <MenuItem value="Department Leads">Department Leads</MenuItem>
                  <MenuItem value="Managers">Managers</MenuItem>
                </Select>
                {userModalMode === 'edit' && (
                  <Typography variant="caption" sx={{ color: '#bbb', mt: -1 }}>
                    Leave password blank if you don't want to change it
                  </Typography>
                )}
                <TextField
                  label={userModalMode === 'add' ? 'Password' : 'New Password'}
                  name="password"
                  type="password"
                  fullWidth
                  value={userFormData.password}
                  onChange={handleUserInputChange}
                  required={userModalMode === 'add'}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                      '&:hover fieldset': { borderColor: '#00bcd4' },
                      '&.Mui-focused fieldset': { borderColor: '#00bcd4' },
                    },
                    '& .MuiInputLabel-root': { color: '#bbb', '&.Mui-focused': { color: '#00bcd4' } },
                  }}
                />
                <FormControlLabel
                  control={<Checkbox checked={userFormData.is_simulated_threat} onChange={handleUserCheckboxChange} name="is_simulated_threat" />}
                  label="Simulate Insider Threat"
                  sx={{ color: '#fff' }}
                />
              </Stack>
              {usersError && (
                <Typography color="error" mt={2} variant="body2" sx={{ background: 'rgba(244, 67, 54, 0.2)', p: 1, borderRadius: 2 }}>
                  {usersError}
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid rgba(0, 188, 212, 0.2)' }}>
              <Button onClick={closeUserModal} disabled={saving} sx={{ color: '#bbb' }}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                variant="contained"
                color="primary"
                disabled={saving}
                sx={{ borderRadius: 2 }}
              >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Save'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* File Modal */}
          <Dialog
            open={fileModalOpen}
            onClose={closeFileModal}
            maxWidth="sm"
            fullWidth
            sx={{
              '& .MuiDialog-paper': {
                background: 'rgba(31, 44, 62, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                border: '1px solid rgba(0, 188, 212, 0.3)',
                color: '#fff',
              },
            }}
          >
            <DialogTitle sx={{ color: '#00bcd4', fontWeight: 'bold' }}>
              {fileModalMode === 'add' ? 'Add New Resource' : `Edit Resource: ${editingResource?.name}`}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2} mt={1}>
                <TextField
                  label="Name"
                  name="name"
                  fullWidth
                  value={fileFormData.name}
                  onChange={handleFileInputChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                      '&:hover fieldset': { borderColor: '#00bcd4' },
                      '&.Mui-focused fieldset': { borderColor: '#00bcd4' },
                    },
                    '& .MuiInputLabel-root': { color: '#bbb', '&.Mui-focused': { color: '#00bcd4' } },
                  }}
                />
                <TextField
                  label="Department"
                  name="department"
                  fullWidth
                  value={fileFormData.department}
                  disabled
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                    },
                    '& .MuiInputLabel-root': { color: '#bbb' },
                  }}
                />
                <Select
                  label="Access Level"
                  name="access_level"
                  value={fileFormData.access_level}
                  onChange={handleFileInputChange as (e: SelectChangeEvent<string>) => void}
                  fullWidth
                  required
                  sx={{
                    color: '#fff',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 188, 212, 0.5)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00bcd4' },
                    '.MuiSvgIcon-root': { color: '#fff' },
                  }}
                >
                  <MenuItem value="">Select Access Level</MenuItem>
                  <MenuItem value="read">Read</MenuItem>
                  <MenuItem value="write">Write</MenuItem>
                  <MenuItem value="none">None</MenuItem>
                </Select>
                <FormControlLabel
                  control={<Checkbox checked={fileFormData.is_folder} onChange={handleFileCheckboxChange} name="is_folder" />}
                  label="Is Folder"
                  sx={{ color: '#fff' }}
                />
              </Stack>
              {filesError && (
                <Typography color="error" mt={2} variant="body2" sx={{ background: 'rgba(244, 67, 54, 0.2)', p: 1, borderRadius: 2 }}>
                  {filesError}
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid rgba(0, 188, 212, 0.2)' }}>
              <Button onClick={closeFileModal} disabled={saving} sx={{ color: '#bbb' }}>
                Cancel
              </Button>
              <Button
                onClick={fileModalMode === 'add' ? handleAddFile : handleUpdateFile}
                variant="contained"
                color="primary"
                disabled={saving}
                sx={{ borderRadius: 2 }}
              >
                {saving ? <CircularProgress size={20} color="inherit" /> : fileModalMode === 'add' ? 'Add' : 'Save'}
              </Button>
            </DialogActions>
          </Dialog>
        </Container>
      </Box>
      <FooterSection />
      </Box>
    </ThemeProvider>
  );
}