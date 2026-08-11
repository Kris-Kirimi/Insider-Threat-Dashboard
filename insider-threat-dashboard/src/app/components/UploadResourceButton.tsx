'use client';

import React, { useRef, useState } from 'react';
import { Button, CircularProgress, Tooltip } from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import { apiUpload } from '@/lib/api';
import { ResourceDto } from '@/types/resource';
import { tokens } from '@/lib/theme';

/**
 * Picks a real file from the user's machine and uploads it.
 *
 * The uploader is granted full_control by the backend, so the usual flow is
 * upload -> hand the new resource to EditAccessDialog -> grant others access.
 */
export default function UploadResourceButton({
  department,
  onUploaded,
  onError,
  label = 'Upload file',
  disabled = false,
  disabledReason,
}: {
  department?: string;
  onUploaded: (resource: ResourceDto) => void;
  onError?: (message: string) => void;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    setBusy(true);
    try {
      const created = await apiUpload<ResourceDto>(
        '/resource/upload/', file, department ? { department } : {},
      );
      onUploaded(created);
    } catch (err: any) {
      let message = 'Upload failed';
      if (err?.status === 413) message = 'That file is too large';
      else if (err?.status === 403) message = 'You may only upload into your own department';
      else if (err?.status === 400) {
        // The API returns {file: [...]} or {department: [...]}.
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.file || parsed.department || 'That file type is not allowed';
        } catch {
          message = 'That file type is not allowed';
        }
      }
      onError?.(String(message));
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <span>
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        startIcon={busy ? <CircularProgress size={16} /> : <UploadFileRoundedIcon />}
        sx={{
          color: tokens.text,
          border: `1px solid ${tokens.hairline}`,
          '&:hover': { borderColor: tokens.accent, background: tokens.accentDim },
        }}
      >
        {busy ? 'Uploading…' : label}
      </Button>
    </span>
  );

  return (
    <>
      <input type="file" hidden ref={inputRef} onChange={handlePick} />
      {disabled && disabledReason ? <Tooltip title={disabledReason}>{button}</Tooltip> : button}
    </>
  );
}
