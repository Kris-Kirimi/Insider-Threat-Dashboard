import logging
import sys

from django.apps import AppConfig
from django.conf import settings

logger = logging.getLogger(__name__)


class MonitoringConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'monitoring'

    def ready(self):
        # Not wrapped in try/except: a broken signals module should fail loudly
        # rather than silently disabling realtime alerts.
        import monitoring.signals  # noqa: F401

        # Kick off one detection pass at boot, but only for an actual server
        # process. ready() also runs for migrate, test, shell and every other
        # management command, where queuing work is unwanted.
        if getattr(settings, 'TESTING', False):
            return
        if len(sys.argv) < 2 or sys.argv[1] not in ('runserver', 'runworker'):
            return

        try:
            from monitoring.tasks import run_all_detections_task
            run_all_detections_task.delay()
        except Exception:
            # Celery/Redis may not be up yet; the beat schedule will pick it up.
            logger.info('Could not queue the boot-time detection run (broker unavailable)',
                        exc_info=True)
