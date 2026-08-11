# users/storage.py
#
# Containment for user-influenced file paths.
import os
from pathlib import Path

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation


def safe_media_path(rel_path):
    """Resolve `rel_path` under MEDIA_ROOT, refusing anything that escapes.

    Resource.path is stored data, so a traversal value ('../.env') could reach
    the filesystem and disclose SECRET_KEY / DATABASE_URL. Serializers keep
    `path` read-only; this is the second line of defence for rows written by
    other means. An absolute path is absorbed by the join and caught by the
    same containment check.
    """
    root = Path(settings.MEDIA_ROOT).resolve()
    candidate = Path(os.path.join(root, str(rel_path or ''))).resolve()

    if candidate != root and not candidate.is_relative_to(root):
        raise SuspiciousFileOperation(
            f'Resolved path escapes MEDIA_ROOT: {rel_path!r}'
        )
    return candidate
