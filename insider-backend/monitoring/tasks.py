# monitoring/tasks.py
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .utils import run_all_detections

logger = logging.getLogger(__name__)

# Retention windows for the nightly cleanup.
AUDIT_LOG_RETENTION_DAYS = 90
ANOMALY_RETENTION_DAYS = 30
CLOSED_ALERT_RETENTION_DAYS = 90


@shared_task(name='monitoring.run_all_detections')
def run_all_detections_task():
    run_all_detections()
    # ML inference for the same short window; skipped gracefully until a
    # model has been trained (python manage.py train_ml_model).
    try:
        from .ml.infer import infer_and_record
        infer_and_record(window_minutes=15)
    except FileNotFoundError:
        logger.debug("No ML model trained yet; skipping inference")
    except Exception:
        logger.exception("ML inference failed")


@shared_task(name='monitoring.train_ml_model')
def train_ml_model_task(days=30):
    """Weekly retrain so the baseline follows current behaviour."""
    try:
        from .ml.train_model import train_and_save
        path = train_and_save()
        logger.info("ML model retrained and saved to %s", path)
    except ValueError:
        logger.info("Not enough audit data to train the ML model yet")
    except Exception:
        logger.exception("ML training failed")


@shared_task(name='monitoring.cleanup_old_data')
def cleanup_old_data_task():
    """Nightly retention: drop stale logs, anomalies and closed alerts."""
    from users.models import AuditLog
    from .models import Alert, Anomaly

    now = timezone.now()
    logs_deleted, _ = AuditLog.objects.filter(
        timestamp__lt=now - timedelta(days=AUDIT_LOG_RETENTION_DAYS)
    ).delete()
    anomalies_deleted, _ = Anomaly.objects.filter(
        created_at__lt=now - timedelta(days=ANOMALY_RETENTION_DAYS)
    ).delete()
    alerts_deleted, _ = Alert.objects.filter(
        status__in=('resolved', 'false_positive'),
        timestamp__lt=now - timedelta(days=CLOSED_ALERT_RETENTION_DAYS),
    ).delete()
    logger.info(
        "Retention cleanup: %s audit logs, %s anomalies, %s closed alerts removed",
        logs_deleted, anomalies_deleted, alerts_deleted,
    )
