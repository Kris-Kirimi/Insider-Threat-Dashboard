from django.core.management.base import BaseCommand
from django.utils import timezone
import pandas as pd


class Command(BaseCommand):
    help = "Train ML model for anomaly detection and save it"

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30, help='how many days of history to use')

    def handle(self, *args, **options):
        days = options['days']
        from users.models import AuditLog
        from monitoring.ml.train_model import train_and_save
        period_start = timezone.now() - pd.Timedelta(days=days)
        qs = AuditLog.objects.filter(timestamp__gte=period_start)
        try:
            path = train_and_save(qs)
            self.stdout.write(self.style.SUCCESS(f"Model trained and saved to {path}"))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Training failed: {e}"))
            raise
