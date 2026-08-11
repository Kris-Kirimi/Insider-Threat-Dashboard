from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from monitoring.models import Alert

User = get_user_model()

# Action names must match what monitoring.utils actually emits, otherwise
# seeded and real alerts never group together in the dashboard.
EXAMPLE_ALERTS = [
    {
        'action': 'otp_failed',
        'description': 'Multiple failed OTP attempts detected',
        'severity': 'high',
    },
    {
        'action': 'unusual_login_hour',
        'description': 'User logged in during unusual hours',
        'severity': 'medium',
    },
    {
        'action': 'excessive_downloads',
        'description': 'User downloaded many files in a short period',
        'severity': 'high',
    },
    {
        'action': 'suspicious_sequence',
        'description': 'User performed suspicious sequence of actions',
        'severity': 'high',
    },
]


class Command(BaseCommand):
    help = (
        'Generate sample alerts for demo purposes. For alerts backed by real '
        'audit evidence, prefer: manage.py simulate_threat'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--emails', nargs='*', default=None,
            help='Target user emails (default: all non-staff users).',
        )

    def handle(self, *args, **options):
        emails = options.get('emails')
        if emails:
            users = list(User.objects.filter(email__in=emails))
            missing = set(emails) - {u.email for u in users}
            for email in sorted(missing):
                self.stdout.write(self.style.WARNING(f'No user {email}, skipping.'))
        else:
            users = list(User.objects.filter(is_staff=False, is_active=True)[:5])

        if not users:
            self.stdout.write(self.style.WARNING(
                'No target users found. Run: manage.py seed_initial --demo'
            ))
            return

        created_count = 0
        for user in users:
            for data in EXAMPLE_ALERTS:
                _, created = Alert.objects.get_or_create(
                    user=user,
                    action=data['action'],
                    description=data['description'],
                    defaults={'severity': data['severity']},
                )
                if created:
                    created_count += 1
                    self.stdout.write(f"Created alert '{data['action']}' for {user.email}")

        self.stdout.write(self.style.SUCCESS(f'Total new alerts created: {created_count}'))
