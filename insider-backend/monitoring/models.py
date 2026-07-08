from django.db import models
from django.contrib.auth import get_user_model
from django.conf import settings

User = get_user_model()

class Alert(models.Model):
    SEVERITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]

    STATUS_CHOICES = [
        ('new', 'New'),
        ('acknowledged', 'Acknowledged'),
        ('investigating', 'Investigating'),
        ('resolved', 'Resolved'),
        ('false_positive', 'False positive'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    action = models.CharField(max_length=255)
    timestamp = models.DateTimeField(auto_now_add=True)
    description = models.TextField()
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    # IDs of the AuditLog rows that triggered this alert (investigation evidence)
    related_logs = models.JSONField(default=list, blank=True)
    cleared = models.BooleanField(default=False)  # legacy flag, kept in sync with status

    def __str__(self):
        return f"{self.timestamp}: {self.user.email} - {self.action} ({self.severity})"

class Anomaly(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    score = models.FloatField()           # anomaly score (higher = more anomalous for some detectors)
    is_anomaly = models.BooleanField(default=False)
    reason = models.CharField(max_length=255, blank=True, null=True)
    related_logs = models.JSONField(blank=True, null=True)  # list of relevant log IDs or snippets
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Anomaly {self.pk} user={self.actor} score={self.score:.3f}"
