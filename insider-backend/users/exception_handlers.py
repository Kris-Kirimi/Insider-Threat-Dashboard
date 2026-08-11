# users/exception_handlers.py
#
# Central auditing of permission denials.
#
# Every 403 the API returns is recorded as an 'unauthorized_access' audit row,
# which is the action name monitoring.utils.detect_unauthorized_access watches
# for. Doing it here rather than in each view matters: DRF raises
# PermissionDenied from inside get_object(), before any view body runs, so a
# view-level log_action() call can never see those denials.
import logging

from rest_framework.views import exception_handler as drf_exception_handler

from .models import AuditLog, Resource

logger = logging.getLogger(__name__)


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _resolve_resource(view, kwargs):
    """The Resource this denial was about, when it was about one at all.

    Only resolves when the view actually operates on Resource, so a 403 on
    /api/monitoring/alerts/3/status/ does not get mis-attributed to resource 3.
    """
    pk = kwargs.get('pk') or kwargs.get('resource_id')
    if not pk or view is None:
        return None
    model = getattr(getattr(view, 'queryset', None), 'model', None)
    if model is None:
        serializer_cls = getattr(view, 'serializer_class', None)
        model = getattr(getattr(serializer_cls, 'Meta', None), 'model', None)
    if model is not Resource:
        return None
    try:
        return Resource.objects.filter(pk=pk).first()
    except (ValueError, TypeError):
        return None


def _audit_denial(context, response):
    request = context.get('request')
    if request is None:
        return
    user = getattr(request, 'user', None)
    # Anonymous callers get 401 normally; a 403 without an identity has no
    # actor to attribute, and AnonymousUser cannot be used as an FK.
    if user is None or not getattr(user, 'is_authenticated', False):
        return

    view = context.get('view')
    detail = ''
    data = getattr(response, 'data', None)
    if isinstance(data, dict):
        detail = str(data.get('detail', ''))[:200]

    AuditLog.objects.create(
        actor=user,
        action='unauthorized_access',
        resource=_resolve_resource(view, context.get('kwargs') or {}),
        ip_address=_client_ip(request),
        metadata={
            'path': request.path,
            'method': request.method,
            'view': type(view).__name__ if view is not None else None,
            'detail': detail,
        },
    )


def audited_exception_handler(exc, context):
    """DRF EXCEPTION_HANDLER that records every permission denial."""
    response = drf_exception_handler(exc, context)

    # Keyed on the status code rather than the exception type so Django's own
    # PermissionDenied (which DRF converts) is covered too, while 401
    # NotAuthenticated is not.
    if response is not None and response.status_code == 403:
        try:
            _audit_denial(context, response)
        except Exception:
            # Auditing must never turn a 403 into a 500.
            logger.exception('Failed to audit a permission denial')

    return response
