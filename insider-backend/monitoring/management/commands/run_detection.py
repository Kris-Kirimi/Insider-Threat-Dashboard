from django.core.management.base import BaseCommand

from monitoring.utils import run_all_detections


class Command(BaseCommand):
    help = 'Run security detection checks on audit logs and create alerts.'

    def handle(self, *args, **options):
        self.stdout.write("Starting detection checks...")
        run_all_detections()
        self.stdout.write(self.style.SUCCESS("Detection checks completed."))
