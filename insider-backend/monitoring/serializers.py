from rest_framework import serializers
from .models import Alert
from users.models import AuditLog


class AlertSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = Alert
        fields = [
            'id', 'user', 'user_email', 'action', 'timestamp', 'description',
            'severity', 'status', 'related_logs', 'cleared',
        ]
        read_only_fields = ['id', 'user_email', 'timestamp']


class EvidenceLogSerializer(serializers.ModelSerializer):
    """Compact audit-log representation shown as alert evidence."""
    actor = serializers.CharField(source='actor.email', default=None, read_only=True)
    resource = serializers.CharField(source='resource.name', default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'actor', 'action', 'resource', 'ip_address', 'timestamp']
