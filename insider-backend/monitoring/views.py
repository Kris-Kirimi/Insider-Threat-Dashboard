from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import AuditLog
from .models import Alert
from .serializers import AlertSerializer, EvidenceLogSerializer
from .risk import compute_risk_scores

# Statuses that count as "handled" for the default (open-only) alert list.
CLOSED_STATUSES = ('resolved', 'false_positive')


class AlertListView(generics.ListAPIView):
    serializer_class = AlertSerializer
    permission_classes = [permissions.IsAdminUser]
    # Unpaginated array by default (existing dashboard contract);
    # clients can pass ?limit=&offset= to page through large histories.
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        qs = Alert.objects.select_related('user').order_by('-timestamp')
        severity = self.request.query_params.get('severity')
        if severity:
            qs = qs.filter(severity=severity)
        show_cleared = self.request.query_params.get('show_cleared')
        if show_cleared not in ('true', '1', 'yes'):
            qs = qs.exclude(status__in=CLOSED_STATUSES)
        return qs


class AlertStatusView(APIView):
    """PATCH {status: acknowledged|investigating|resolved|false_positive}."""
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        alert = get_object_or_404(Alert, pk=pk)
        new_status = request.data.get('status')
        valid = {choice for choice, _ in Alert.STATUS_CHOICES}
        if new_status not in valid:
            return Response(
                {'detail': f"status must be one of {sorted(valid)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        alert.status = new_status
        alert.cleared = new_status in CLOSED_STATUSES
        alert.save(update_fields=['status', 'cleared'])
        return Response(AlertSerializer(alert).data)


class AlertClearView(APIView):
    """Legacy endpoint: clearing now maps to status=resolved."""
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        alert = get_object_or_404(Alert, pk=pk)
        alert.status = 'resolved'
        alert.cleared = True
        alert.save(update_fields=['status', 'cleared'])
        return Response(AlertSerializer(alert).data)


class AlertEvidenceView(APIView):
    """The audit-log rows that triggered an alert."""
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        alert = get_object_or_404(Alert, pk=pk)
        logs = AuditLog.objects.filter(id__in=alert.related_logs or []) \
                               .select_related('actor', 'resource') \
                               .order_by('timestamp')
        return Response({
            'alert': AlertSerializer(alert).data,
            'evidence': EvidenceLogSerializer(logs, many=True).data,
        })


class RiskScoreView(APIView):
    """Per-user risk scores derived from recent alerts."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(compute_risk_scores())
