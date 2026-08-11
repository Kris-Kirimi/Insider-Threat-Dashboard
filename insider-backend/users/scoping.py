# users/scoping.py
#
# Queryset narrowing for collection endpoints.
#
# RoleEnforcer protects individual objects, but DRF only calls
# has_object_permission from get_object() -- never for list or create. Without
# the narrowing below, GET /api/resources/ would return every row in the
# database to any authenticated employee.
from django.db.models import Q

from .models import AccessControl, Resource, ResourceAccess
from .permissions import is_admin


def scope_resources_for(user, queryset=None):
    """Resources `user` is allowed to see in a listing.

    Visible: owned, explicitly granted (per-user or per-role), or belonging to
    the user's own department. Anything explicitly set to 'none' is removed
    afterwards so a denial always wins.
    """
    qs = Resource.objects.all() if queryset is None else queryset

    if not user or not getattr(user, 'is_authenticated', False):
        return qs.none()
    if is_admin(user):
        return qs

    visible = Q(created_by=user) | Q(access_controls__user=user)
    if getattr(user, 'role_id', None):
        visible |= Q(access_entries__role_id=user.role_id)
    if getattr(user, 'department_id', None):
        visible |= Q(department_id=user.department_id)

    denied_ids = set(
        AccessControl.objects.filter(user=user, permission='none')
        .values_list('resource_id', flat=True)
    )
    if getattr(user, 'role_id', None):
        denied_ids.update(
            ResourceAccess.objects.filter(role_id=user.role_id, access_level='none')
            .values_list('resource_id', flat=True)
        )

    return qs.filter(visible).exclude(pk__in=denied_ids).distinct()


class ResourceScopedQuerysetMixin:
    """Narrows *list* results only.

    Detail routes deliberately keep the full queryset: if get_object() ran
    against a scoped queryset, a cross-department fetch would 404 before
    RoleEnforcer ran, so no 'unauthorized_access' audit row would be written
    and the detection engine would lose the signal. Listing is narrowed to
    prevent enumeration; individual access is denied loudly with a 403.
    """
    scoped_actions = ('list',)

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self, 'action', None) in self.scoped_actions:
            return scope_resources_for(self.request.user, qs)
        return qs
