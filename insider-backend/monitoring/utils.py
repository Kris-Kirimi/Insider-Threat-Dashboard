# monitoring/utils.py
#
# Rule-based detection engine. run_all_detections() is executed every
# 60 seconds by Celery Beat (see CELERY_BEAT_SCHEDULE), so every detector
# only inspects a recent window of audit logs and alert creation is
# de-duplicated per user/action within ALERT_DEDUP_MINUTES.
import logging
from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from monitoring.models import Alert
from users.models import AuditLog

logger = logging.getLogger(__name__)
User = get_user_model()

# Don't re-raise the same user/action alert more often than this.
ALERT_DEDUP_MINUTES = 60


def _create_alert(user, action, description, severity):
    """Create an alert unless the same user/action alerted recently."""
    window_start = timezone.now() - timedelta(minutes=ALERT_DEDUP_MINUTES)
    if Alert.objects.filter(user=user, action=action, timestamp__gte=window_start).exists():
        return None
    alert = Alert.objects.create(
        user=user, action=action, description=description, severity=severity
    )
    logger.warning("Alert created: %s for user %s", action, user)
    return alert


def _users_exceeding(action_filter, threshold, window_minutes):
    """Return users with more than `threshold` matching logs in the window."""
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    logs = AuditLog.objects.filter(timestamp__gte=window_start, **action_filter)
    counts = defaultdict(int)
    for log in logs.select_related('actor'):
        if log.actor:
            counts[log.actor] += 1
    return {user: count for user, count in counts.items() if count > threshold}


def detect_failed_otp_bruteforce(threshold=5, window_minutes=15):
    """More than `threshold` failed OTP attempts in the window."""
    return _users_exceeding({'action': 'otp_failed'}, threshold, window_minutes)


def detect_rapid_logins(threshold=5, window_minutes=10):
    """More than `threshold` logins in the window (credential stuffing, bots)."""
    return _users_exceeding({'action': 'login'}, threshold, window_minutes)


def detect_unusual_hours_login(start_hour=0, end_hour=6, window_minutes=15):
    """Logins between start_hour and end_hour local time, in the recent window."""
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    flagged = []
    logs = AuditLog.objects.filter(action='login', timestamp__gte=window_start)
    for log in logs.select_related('actor'):
        local_hour = timezone.localtime(log.timestamp).hour
        if log.actor and start_hour <= local_hour < end_hour:
            flagged.append(log.actor)
    return flagged


def detect_excessive_downloads(threshold=5, window_minutes=5):
    """More than `threshold` downloads in the window (possible exfiltration)."""
    return _users_exceeding({'action__icontains': 'download'}, threshold, window_minutes)


def detect_unauthorized_access(window_minutes=15):
    """Denied resource accesses logged by the permission layer."""
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    return list(
        AuditLog.objects.filter(action='unauthorized_access', timestamp__gte=window_start)
        .exclude(actor=None)
        .select_related('actor')
    )


def detect_suspicious_sequences(window_minutes=10):
    """login → delete → logout inside the window: possible evidence removal."""
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    logs = AuditLog.objects.filter(timestamp__gte=window_start).order_by('timestamp')
    actions_by_user = defaultdict(list)
    for log in logs.select_related('actor'):
        if log.actor:
            actions_by_user[log.actor].append(log.action.lower())
    flagged = []
    for user, names in actions_by_user.items():
        try:
            i_login = names.index('login')
            i_delete = next(i for i in range(i_login + 1, len(names)) if 'delete' in names[i])
            next(i for i in range(i_delete + 1, len(names)) if 'logout' in names[i])
            flagged.append(user)
        except (StopIteration, ValueError):
            pass
    return flagged


def run_all_detections():
    for user, count in detect_failed_otp_bruteforce().items():
        _create_alert(
            user, 'otp_failed',
            f"More than 5 failed OTP attempts in the last 15 minutes ({count})",
            'high',
        )

    for user, count in detect_rapid_logins().items():
        _create_alert(
            user, 'rapid_login',
            f"User {user.email} logged in {count} times in a short period",
            'medium',
        )

    for user in detect_unusual_hours_login():
        _create_alert(
            user, 'unusual_login_hour',
            f"User {user.email} logged in during unusual hours (00:00-06:00)",
            'medium',
        )

    for user, count in detect_excessive_downloads().items():
        _create_alert(
            user, 'excessive_downloads',
            f"User {user.email} downloaded {count} files in a short period",
            'high',
        )

    for log in detect_unauthorized_access():
        _create_alert(
            log.actor, 'unauthorized_access',
            f"User {log.actor.email} attempted to access a resource outside their allowed scope",
            'high',
        )

    for user in detect_suspicious_sequences():
        _create_alert(
            user, 'suspicious_sequence',
            f"User {user.email} performed login → delete → logout in quick succession",
            'high',
        )
