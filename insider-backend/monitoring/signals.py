# monitoring/signals.py
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Alert
from .serializers import AlertSerializer

logger = logging.getLogger(__name__)


def _broadcast(alert_id):
    """Push a newly created alert to connected dashboards."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        alert = Alert.objects.filter(pk=alert_id).select_related('user').first()
        if alert is None:
            return
        async_to_sync(channel_layer.group_send)(
            'alerts',
            {
                'type': 'alert_created',  # maps to AlertConsumer.alert_created
                'alert': AlertSerializer(alert).data,
            },
        )
    except Exception:
        # The websocket push is best-effort. Without this guard an unreachable
        # Redis made Alert.objects.create() raise, which aborted
        # run_all_detections() at the first alert and silently skipped every
        # remaining detector in that cycle.
        logger.warning('Could not broadcast alert %s over websockets', alert_id, exc_info=True)


@receiver(post_save, sender=Alert)
def broadcast_alert(sender, instance, created, **kwargs):
    if not created:
        return
    # Deferred to commit so the dashboard never receives an alert that a later
    # rollback removes.
    transaction.on_commit(lambda: _broadcast(instance.pk))
