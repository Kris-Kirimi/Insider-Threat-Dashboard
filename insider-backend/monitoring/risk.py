# monitoring/risk.py
#
# User risk scoring: a rolling 30-day, time-decayed weighted sum of alerts.
# Recent and severe activity dominates; old alerts fade out gradually.
import math
from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Alert

RISK_WINDOW_DAYS = 30
DECAY_HALF_LIFE_DAYS = 7  # an alert loses half its weight every 7 days

SEVERITY_WEIGHTS = {
    'low': 1,
    'medium': 2,
    'high': 5,
    'critical': 10,
}

RISK_LEVELS = [
    (15, 'critical'),
    (7, 'high'),
    (3, 'elevated'),
    (0, 'low'),
]


def risk_level(score):
    for threshold, level in RISK_LEVELS:
        if score >= threshold:
            return level
    return 'low'


def compute_risk_scores():
    """Return scored users sorted by risk, highest first."""
    now = timezone.now()
    window_start = now - timedelta(days=RISK_WINDOW_DAYS)
    alerts = Alert.objects.filter(timestamp__gte=window_start) \
                          .exclude(status='false_positive') \
                          .select_related('user')

    scores = defaultdict(float)
    counts = defaultdict(int)
    for alert in alerts:
        weight = SEVERITY_WEIGHTS.get(alert.severity, 1)
        age_days = (now - alert.timestamp).total_seconds() / 86400
        decay = math.pow(0.5, age_days / DECAY_HALF_LIFE_DAYS)
        scores[alert.user] += weight * decay
        counts[alert.user] += 1

    results = [
        {
            'user_id': user.id,
            'email': user.email,
            'full_name': user.full_name,
            'department': user.department.name if user.department else None,
            'score': round(score, 1),
            'level': risk_level(score),
            'alert_count': counts[user],
        }
        for user, score in scores.items()
    ]
    results.sort(key=lambda r: r['score'], reverse=True)
    return results
