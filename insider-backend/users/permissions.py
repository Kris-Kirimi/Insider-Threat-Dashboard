# users/permissions.py
#
# Authorization primitives. Two independent notions of authority:
#
#   * is_staff / is_superuser -- the admin-console boundary. Staff may reach
#     the monitoring endpoints and manage accounts.
#   * Role.level              -- privilege *within* a department. Seeded as
#     System Admin=4, Manager=3, Analyst=2, Employee=1.
#
# Use is_admin() and role_level() rather than touching the flags directly, so
# there is one place to change if the model evolves.
from rest_framework import permissions

from .models import AccessControl, ResourceAccess

ACTION_MAP = {
    'GET': 'read',
    'HEAD': 'read',
    'OPTIONS': 'read',
    'POST': 'write',
    'PUT': 'write',
    'PATCH': 'write',
    'DELETE': 'delete',
}

PERM_PRIORITY = {
    'none': 0,
    'read': 1,
    'download': 2,
    'upload': 3,
    'write': 4,
    'delete': 5,
    'full_control': 100,
}

LEVEL_EMPLOYEE = 1
LEVEL_ANALYST = 2
LEVEL_MANAGER = 3
LEVEL_SYSADMIN = 4


def is_admin(user):
    """True for the staff/superuser accounts allowed into the admin console."""
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and (user.is_staff or user.is_superuser)
    )


def role_level(user):
    """The user's numeric role level (0 when unauthenticated or role-less)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return 0
    if user.is_superuser:
        return LEVEL_SYSADMIN
    role = getattr(user, 'role', None)
    return getattr(role, 'level', 0) or 0


#: What a same-department user gets when no explicit ACL row applies.
#: 'download' keeps today's behaviour (department mates can fetch department
#: files) while still letting an explicit 'read' grant mean read-only. Set to
#: 'read' to lock department files down further.
DEPARTMENT_DEFAULT_ACCESS = 'download'


def effective_access(user, resource):
    """The single source of truth for what `user` may do to `resource`.

    Both RoleEnforcer (the gate that returns 403) and
    ResourceSerializer.get_access_for_current_user (the label the UI renders)
    call this, so the padlock an employee sees and the answer the API gives
    cannot disagree. They used to be two hand-written copies of this chain and
    had already drifted: the serializer had no is_admin branch, so a superuser
    -- whose department is normally None -- was shown 'none' on files it could
    actually download.

    Precedence, most specific first. An explicit ACL row is *authoritative*:
    it decides outright instead of falling through to a broader rule, which is
    what makes a grant of 'none' a real revocation.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return 'none'

    # 0. Admin console accounts bypass the matrix.
    if is_admin(user):
        return 'full_control'

    # 1. Explicit per-user grant or denial.
    ac = AccessControl.objects.filter(user=user, resource=resource).first()
    if ac is not None:
        return ac.permission

    # 2. Explicit per-role grant or denial.
    if getattr(user, 'role_id', None):
        ra = ResourceAccess.objects.filter(resource=resource, role_id=user.role_id).first()
        if ra is not None:
            return ra.access_level

    # 3. Owner of the resource.
    if getattr(resource, 'created_by_id', None) == user.id:
        return 'full_control'

    # 4. Same department: managers may write and delete, everyone else gets
    #    the department default. 'delete' rather than 'full_control' so a
    #    manager still cannot rewrite the ACL matrix from resource endpoints.
    user_dept = getattr(user, 'department_id', None)
    if user_dept and user_dept == getattr(resource, 'department_id', None):
        if role_level(user) >= LEVEL_MANAGER:
            return 'delete'
        return DEPARTMENT_DEFAULT_ACCESS

    return 'none'


def may(user, resource, action):
    """True when the user's effective access covers `action`.

    Note the ladder means an 'upload' grant also implies 'download' (3 >= 2).
    If genuine drop-box semantics are ever needed ("may deposit, may not
    retrieve"), replace this comparison with an explicit
    {grant: {implied actions}} map -- PERM_PRIORITY is used elsewhere and
    should not be reordered to express it.
    """
    return (PERM_PRIORITY.get(effective_access(user, resource), 0)
            >= PERM_PRIORITY.get(action, 0))


class IsAdmin(permissions.BasePermission):
    """Admin console access. Equivalent to DRF's IsAdminUser, with a message."""
    message = 'Administrator access required.'

    def has_permission(self, request, view):
        return is_admin(request.user)


class IsSelfOrAdmin(permissions.BasePermission):
    """Object-level: you may act on your own record, admins on anyone's."""
    message = 'You may only modify your own account.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if is_admin(request.user):
            return True
        return getattr(obj, 'pk', None) == request.user.pk


class IsManagerOrAdmin(permissions.BasePermission):
    """Requires a manager-grade role (level >= 3) or admin."""
    message = 'Manager-level access required.'

    def has_permission(self, request, view):
        return is_admin(request.user) or role_level(request.user) >= LEVEL_MANAGER


class RoleEnforcer(permissions.BasePermission):
    """Per-resource access control.

    Precedence, most specific first. An explicit ACL row is *authoritative*:
    it decides the request outright rather than falling through to a broader
    rule. That is what makes access_level='none' a genuine revocation -- the
    previous version only ever granted, so a 'none' row fell through to the
    department rule and still allowed reads.
    """
    message = 'You do not have access to this resource.'

    def get_action(self, request):
        return ACTION_MAP.get(request.method)

    def has_permission(self, request, view):
        # Collection-level gate only. Note DRF never calls
        # has_object_permission for list/create, so list endpoints must also
        # narrow their queryset -- see users/scoping.py.
        return bool(
            request.user
            and request.user.is_authenticated
            and self.get_action(request) is not None
        )

    def has_object_permission(self, request, view, obj):
        action = self.get_action(request)
        if action is None:
            return False
        return may(request.user, obj, action)
