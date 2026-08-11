"""Generate realistic audit activity so the detection engine can be demonstrated.

Some detectors are impractical to trigger by hand -- 'rapid login' needs six
full login + emailed-OTP round trips inside ten minutes. This command writes
the same AuditLog rows those flows would produce, back-dated into each
detector's window, so a demo can show detection working end to end.

Real HTTP traffic remains the *test* path (see monitoring/tests_detection_e2e.py);
this is the *demo* path.

    manage.py simulate_threat --user emp@example.com --scenario all --run-detections
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from users.models import AuditLog, Resource

User = get_user_model()

SCENARIOS = (
    'otp_bruteforce',
    'login_bruteforce',
    'rapid_login',
    'unusual_hours',
    'exfiltration',
    'unauthorized',
    'sequence',
)


class Command(BaseCommand):
    help = 'Simulate insider-threat activity for a user so detectors can fire.'

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True, help='Email of the user to simulate.')
        parser.add_argument('--scenario', default='all', choices=('all',) + SCENARIOS)
        parser.add_argument('--count', type=int, default=None,
                            help='Events to generate (default: just over each threshold).')
        parser.add_argument('--run-detections', action='store_true',
                            help='Run the detection engine immediately afterwards.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be written without writing it.')
        parser.add_argument('--force', action='store_true',
                            help='Allow running when DEBUG is off.')

    # -- helpers ---------------------------------------------------------
    def _emit(self, user, action, when, resource=None, metadata=None):
        """Write one audit row at a specific time.

        AuditLog.timestamp is auto_now_add, so it cannot be set on create --
        the row is written first and then back-dated.
        """
        if self.dry_run:
            self.events.append((action, when))
            return
        log = AuditLog.objects.create(
            actor=user, action=action, resource=resource,
            ip_address='198.51.100.24',
            metadata={'simulated': True, **(metadata or {})},
        )
        AuditLog.objects.filter(pk=log.pk).update(timestamp=when)
        self.events.append((action, when))

    def _resource_for(self, user):
        return (Resource.objects.filter(created_by=user).first()
                or Resource.objects.filter(department_id=getattr(user, 'department_id', None)).first()
                or Resource.objects.first())

    # -- scenarios -------------------------------------------------------
    def scenario_otp_bruteforce(self, user, now, count):
        # One more than the detector's threshold, matching what the lockout
        # path now logs on the blocked attempt.
        n = count or settings.DETECTION['OTP_FAILURE_THRESHOLD'] + 1
        for i in range(n):
            self._emit(user, 'otp_failed', now - timedelta(minutes=n - i),
                       metadata={'locked_out': i >= settings.DETECTION['OTP_LOCKOUT_THRESHOLD']})

    def scenario_login_bruteforce(self, user, now, count):
        n = count or settings.DETECTION['LOGIN_FAILURE_THRESHOLD'] + 1
        for i in range(n):
            self._emit(user, 'login_failed', now - timedelta(minutes=n - i),
                       metadata={'email': user.email,
                                 'locked_out': i >= settings.DETECTION['LOGIN_LOCKOUT_THRESHOLD']})

    def scenario_rapid_login(self, user, now, count):
        n = count or settings.DETECTION['RAPID_LOGIN_THRESHOLD'] + 1
        window = settings.DETECTION['RAPID_LOGIN_WINDOW_MINUTES']
        for i in range(n):
            self._emit(user, 'login', now - timedelta(seconds=int(window * 60 * i / (n + 1))))

    def scenario_unusual_hours(self, user, now, count):
        # Place the login inside the unusual-hours band *in local time*, and
        # inside the detector's recent window.
        local = timezone.localtime(now)
        target_hour = settings.DETECTION['UNUSUAL_HOUR_START'] + 2
        candidate = local.replace(hour=target_hour, minute=30, second=0, microsecond=0)
        if candidate > local:
            candidate -= timedelta(days=1)
        window = settings.DETECTION['UNUSUAL_HOUR_WINDOW_MINUTES']
        if (local - candidate) > timedelta(minutes=window):
            self.stdout.write(self.style.WARNING(
                f'  note: local time is {local:%H:%M}; the unusual-hours detector only looks '
                f'back {window} min, so this row will not alert until the clock is inside '
                f"{settings.DETECTION['UNUSUAL_HOUR_START']:02d}:00-"
                f"{settings.DETECTION['UNUSUAL_HOUR_END']:02d}:00. "
                'Use --scenario unusual_hours during those hours, or raise DETECT_HOUR_WINDOW.'
            ))
            candidate = now - timedelta(minutes=1)
        for i in range(count or 1):
            self._emit(user, 'login', candidate - timedelta(seconds=i * 30))

    def scenario_exfiltration(self, user, now, count):
        n = count or settings.DETECTION['DOWNLOAD_THRESHOLD'] + 1
        resource = self._resource_for(user)
        window = settings.DETECTION['DOWNLOAD_WINDOW_MINUTES']
        for i in range(n):
            self._emit(user, 'download_resource',
                       now - timedelta(seconds=int(window * 60 * i / (n + 1))),
                       resource=resource)

    def scenario_unauthorized(self, user, now, count):
        # Prefer a resource the user genuinely cannot reach, and mirror the
        # metadata shape the audited exception handler produces so demo rows
        # render identically to real ones in the evidence panel.
        target = (Resource.objects
                  .exclude(department_id=getattr(user, 'department_id', None))
                  .first()) or self._resource_for(user)
        for i in range(count or 2):
            self._emit(
                user, 'unauthorized_access', now - timedelta(minutes=i + 1), resource=target,
                metadata={
                    'path': f'/api/resources/{target.pk if target else 0}/',
                    'method': 'GET',
                    'view': 'ResourceViewSet',
                    'detail': 'You do not have access to this resource.',
                },
            )

    def scenario_sequence(self, user, now, count):
        resource = self._resource_for(user)
        base = now - timedelta(minutes=2)
        self._emit(user, 'login', base)
        self._emit(user, 'delete_resource', base + timedelta(seconds=20), resource=resource)
        self._emit(user, 'logout', base + timedelta(seconds=40))

    # -- entrypoint ------------------------------------------------------
    def handle(self, *args, **options):
        if not settings.DEBUG and not options['force']:
            raise CommandError(
                'Refusing to write simulated audit data with DEBUG=False. '
                'Re-run with --force if this really is a demo environment.'
            )

        try:
            user = User.objects.get(email=options['user'])
        except User.DoesNotExist:
            raise CommandError(
                f"No user {options['user']}. Seed demo accounts with: "
                'manage.py seed_initial --demo'
            )

        self.dry_run = options['dry_run']
        self.events = []
        now = timezone.now()

        chosen = SCENARIOS if options['scenario'] == 'all' else (options['scenario'],)
        for name in chosen:
            self.stdout.write(f'-> {name}')
            getattr(self, f'scenario_{name}')(user, now, options['count'])

        verb = 'Would write' if self.dry_run else 'Wrote'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {len(self.events)} audit events for {user.email}'
        ))

        if options['run_detections'] and not self.dry_run:
            from monitoring.models import Alert
            from monitoring.utils import run_all_detections
            before = Alert.objects.count()
            run_all_detections()
            created = Alert.objects.count() - before
            self.stdout.write(self.style.SUCCESS(f'Detection run created {created} alert(s).'))
            for alert in Alert.objects.order_by('-timestamp')[:created or 0]:
                self.stdout.write(f'  [{alert.severity:8s}] {alert.action}: {alert.description}')
        elif not options['run_detections']:
            self.stdout.write('Run `manage.py run_detection` (or wait for Celery Beat) to score these.')
