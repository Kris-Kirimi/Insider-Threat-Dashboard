from django.urls import path
from .views import (
    AlertListView,
    AlertClearView,
    AlertStatusView,
    AlertEvidenceView,
    RiskScoreView,
)

urlpatterns = [
    path('alerts/', AlertListView.as_view(), name='alert-list'),
    path('alerts/<int:pk>/clear/', AlertClearView.as_view(), name='alert-clear'),
    path('alerts/<int:pk>/status/', AlertStatusView.as_view(), name='alert-status'),
    path('alerts/<int:pk>/evidence/', AlertEvidenceView.as_view(), name='alert-evidence'),
    path('risk-scores/', RiskScoreView.as_view(), name='risk-scores'),
]
