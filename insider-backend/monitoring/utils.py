# monitoring/utils.py
#
# Rule-based detection engine. run_all_detections() runs every 60 seconds via
# Celery Beat, so each detector inspects only a recent window of audit logs.
#
# Thresholds live in settings.DETECTION and are read *inside* each function so
# they can be overridden per-environment and in tests.
import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from monitoring.models import Alert
from users.models import AuditLog

logger = logging.getLogger(__name__)
User = get_user_model()

# Statuses that mean an analyst has finished with an alert.
CLOSED_STATUSES = ('resolved', 'false_positive')


def _cfg(key):
    return settings.DETECTION[key]


def _create_alert(user, action, description, severity, related_logs=None):
    """Create an alert unless the same evidence has already been reported.

    Deduplication compares the *evidence set* rather than only elapsed time.
    A pure time window either suppressed genuinely new activity (a sustained
    download burst became one alert per hour) or, if closed alerts were simply
    excluded, re-fired on the same logs the moment an analyst triaged them.
    Comparing log ids means: same evidence -> stay quiet; any new evidence ->
    alert, even if a similar alert was just resolved.
    """
    window_start = timezone.now() - timedelta(minutes=_cfg('ALERT_DEDUP_MINUTES'))
    recent = Alert.objects.filter(user=user, action=action, timestamp__gte=window_start)

    if related_logs:
        already_reported = set()
        for ids in recent.values_list('related_logs', flat=True):
            already_reported.update(ids or [])
        if not set(related_logs) - already_reported:
            return None
    elif recent.exclude(status__in=CLOSED_STATUSES).exists():
        # No evidence ids to compare (e.g. correlated_threat): fall back to
        # time-based suppression, but only against still-open alerts.
        return None

    alert = Alert.objects.create(
        user=user,
        action=action,
        description=description,
        severity=severity,
        related_logs=list(related_logs or []),
    )
    logger.warning("Alert created: %s for user %s", action, user)
    return alert


def _users_exceeding(action_filter, threshold, window_minutes):
    """Users with more than `threshold` matching logs in the window.

    Returns {user: [log_id, ...]} so alerts can carry their evidence.
    """
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    logs = AuditLog.objects.filter(timestamp__gte=window_start, **action_filter)
    per_user = defaultdict(list)
    for log in logs.select_related('actor'):
        if log.actor:
            per_user[log.actor].append(log.id)
    return {user: ids for user, ids in per_user.items() if len(ids) > threshold}


def detect_failed_otp_bruteforce(threshold=None, window_minutes=None):
    """More than `threshold` failed OTP attempts in the window.

    Note this only works because verify_otp_and_token also logs the attempt it
    rejects with a 429. If the view stopped logging past the lockout, the count
    would saturate at the lockout threshold and never exceed it.
    """
    return _users_exceeding(
        {'action': 'otp_failed'},
        _cfg('OTP_FAILURE_THRESHOLD') if threshold is None else threshold,
        _cfg('OTP_FAILURE_WINDOW_MINUTES') if window_minutes is None else window_minutes,
    )


def detect_failed_logins(threshold=None, window_minutes=None):
    """More than `threshold` failed password logins in the window.

    Only surfaces known accounts: _users_exceeding skips rows with no actor,
    and Alert.user is a non-null FK, so probes against addresses that do not
    exist cannot become alerts without a schema change. Those attempts are
    still audited, and login_send_otp still rate-limits them by IP.
    """
    return _users_exceeding(
        {'action': 'login_failed'},
        _cfg('LOGIN_FAILURE_THRESHOLD') if threshold is None else threshold,
        _cfg('LOGIN_FAILURE_WINDOW_MINUTES') if window_minutes is None else window_minutes,
    )


def detect_rapid_logins(threshold=None, window_minutes=None):
    """More than `threshold` logins in the window (credential stuffing, bots)."""
    return _users_exceeding(
        {'action': 'login'},
        _cfg('RAPID_LOGIN_THRESHOLD') if threshold is None else threshold,
        _cfg('RAPID_LOGIN_WINDOW_MINUTES') if window_minutes is None else window_minutes,
    )


def detect_unusual_hours_login(start_hour=None, end_hour=None, window_minutes=None):
    """Logins between start_hour and end_hour local time, in the recent window."""
    start_hour = _cfg('UNUSUAL_HOUR_START') if start_hour is None else start_hour
    end_hour = _cfg('UNUSUAL_HOUR_END') if end_hour is None else end_hour
    window_minutes = _cfg('UNUSUAL_HOUR_WINDOW_MINUTES') if window_minutes is None else window_minutes

    window_start = timezone.now() - timedelta(minutes=window_minutes)
    per_user = defaultdict(list)
    logs = AuditLog.objects.filter(action='login', timestamp__gte=window_start)
    for log in logs.select_related('actor'):
        # localtime() so the band means 00:00-06:00 in TIME_ZONE, not UTC.
        local_hour = timezone.localtime(log.timestamp).hour
        if log.actor and start_hour <= local_hour < end_hour:
            per_user[log.actor].append(log.id)
    return dict(per_user)


def detect_excessive_downloads(threshold=None, window_minutes=None):
    """More than `threshold` downloads in the window (possible exfiltration)."""
    return _users_exceeding(
        {'action__icontains': 'download'},
        _cfg('DOWNLOAD_THRESHOLD') if threshold is None else threshold,
        _cfg('DOWNLOAD_WINDOW_MINUTES') if window_minutes is None else window_minutes,
    )


def detect_unauthorized_access(window_minutes=None):
    """Denied requests recorded by the audited exception handler."""
    window_minutes = _cfg('UNAUTHORIZED_WINDOW_MINUTES') if window_minutes is None else window_minutes
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    per_user = defaultdict(list)
    logs = (AuditLog.objects
            .filter(action='unauthorized_access', timestamp__gte=window_start)
            .exclude(actor=None)
            .select_related('actor'))
    for log in logs:
        per_user[log.actor].append(log.id)
    return dict(per_user)


def detect_suspicious_sequences(window_minutes=None):
    """login -> delete -> logout inside the window: possible evidence removal."""
    window_minutes = _cfg('SEQUENCE_WINDOW_MINUTES') if window_minutes is None else window_minutes
    window_start = timezone.now() - timedelta(minutes=window_minutes)
    logs = AuditLog.objects.filter(timestamp__gte=window_start).order_by('timestamp')

    by_user = defaultdict(list)
    for log in logs.select_related('actor'):
        if log.actor:
            by_user[log.actor].append((log.action.lower(), log.id))

    flagged = {}
    for user, entries in by_user.items():
        names = [name for name, _ in entries]
        try:
            i_login = names.index('login')
            i_delete = next(i for i in range(i_login + 1, len(names)) if 'delete' in names[i])
            i_logout = next(i for i in range(i_delete + 1, len(names)) if 'logout' in names[i])
            flagged[user] = [entries[i][1] for i in (i_login, i_delete, i_logout)]
        except (StopIteration, ValueError):
            pass
    return flagged


def escalate_correlated_alerts():
    """Several distinct detections for one user in the window -> one critical alert."""
    window_start = timezone.now() - timedelta(minutes=_cfg('ESCALATION_WINDOW_MINUTES'))
    recent = (Alert.objects
              .filter(timestamp__gte=window_start)
              .exclude(action='correlated_threat')
              .select_related('user'))

    actions_by_user = defaultdict(set)
    for alert in recent:
        actions_by_user[alert.user].add(alert.action)

    for user, actions in actions_by_user.items():
        if len(actions) >= _cfg('ESCALATION_DISTINCT_ALERTS'):
            _create_alert(
                user, 'correlated_threat',
                f"User {user.email} triggered {len(actions)} distinct detections within "
                f"{_cfg('ESCALATION_WINDOW_MINUTES')} minutes: {', '.join(sorted(actions))}",
                'critical',
            )


def run_all_detections():
    for user, log_ids in detect_failed_otp_bruteforce().items():
        _create_alert(
            user, 'otp_failed',
            f"{len(log_ids)} failed OTP attempts in the last "
            f"{_cfg('OTP_FAILURE_WINDOW_MINUTES')} minutes",
            'high', log_ids,
        )

    for user, log_ids in detect_failed_logins().items():
        _create_alert(
            user, 'login_failed',
            f"{len(log_ids)} failed password logins for {user.email} in the last "
            f"{_cfg('LOGIN_FAILURE_WINDOW_MINUTES')} minutes",
            'high', log_ids,
        )

    for user, log_ids in detect_rapid_logins().items():
        _create_alert(
            user, 'rapid_login',
            f"User {user.email} logged in {len(log_ids)} times in a short period",
            'medium', log_ids,
        )

    for user, log_ids in detect_unusual_hours_login().items():
        _create_alert(
            user, 'unusual_login_hour',
            f"User {user.email} logged in during unusual hours "
            f"({_cfg('UNUSUAL_HOUR_START'):02d}:00-{_cfg('UNUSUAL_HOUR_END'):02d}:00)",
            'medium', log_ids,
        )

    for user, log_ids in detect_excessive_downloads().items():
        _create_alert(
            user, 'excessive_downloads',
            f"User {user.email} downloaded {len(log_ids)} files in a short period",
            'high', log_ids,
        )

    for user, log_ids in detect_unauthorized_access().items():
        _create_alert(
            user, 'unauthorized_access',
            f"User {user.email} was denied access {len(log_ids)} time(s) "
            f"on resources outside their permissions",
            'high', log_ids,
        )

    for user, log_ids in detect_suspicious_sequences().items():
        _create_alert(
            user, 'suspicious_sequence',
            f"User {user.email} performed login -> delete -> logout in quick succession",
            'high', log_ids,
        )

    escalate_correlated_alerts()
