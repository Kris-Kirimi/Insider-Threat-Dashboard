from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import SuspiciousFileOperation, ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.mail import send_mail
from django.http import FileResponse, Http404, JsonResponse
from django.utils.crypto import get_random_string
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from rest_framework import status, permissions, generics, viewsets, serializers
from datetime import timedelta
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.utils import timezone
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny, IsAuthenticated
from .models import Resource, AccessControl
from .serializers import (
    AdminUserSerializer, AuditLogRowSerializer, UserSerializer, ResourceSerializer,
    AccessControlSerializer, UserPreferenceSerializer,
)
from .models import (
    ACCESS_LEVELS, User, OTP, Resource, AuditLog, Department, Role, UserPreference,
)
from rest_framework.serializers import ModelSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q
from .permissions import (
    IsAdmin, IsSelfOrAdmin, LEVEL_MANAGER, RoleEnforcer, is_admin, may, role_level,
)
from .scoping import ResourceScopedQuerysetMixin
from .storage import safe_media_path
from .models import ResourceAccess
from django.db import transaction

import os
import logging

logger = logging.getLogger(__name__)

User = get_user_model()


# Helper: generate JWT tokens for user
def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}

def log_action(actor, action, resource=None, ip=None, metadata=None):
    AuditLog.objects.create(actor=actor, action=action, resource=resource, ip_address=ip, metadata=metadata or {})

# ----------------------------------
# USER MANAGEMENT
# ----------------------------------
class UserViewSet(viewsets.ModelViewSet):
    """Account management.

    Replaces the previous list_users / user_detail / update_user views, which
    were all IsAuthenticated-only. update_user in particular had no ownership
    check, so any employee could reset any administrator's password.

    Authority split:
      * create / destroy        -- admins only
      * update / partial_update -- yourself, or an admin
      * list / retrieve         -- any authenticated user, narrowed to their
                                   own department

    Non-admins additionally receive UserSerializer, where role, is_staff and
    password are not writable -- so even a self-update cannot escalate.
    """
    queryset = User.objects.select_related('department', 'role').order_by('email')

    def get_permissions(self):
        # 'preferences' must be listed here, or it falls through to IsAdmin()
        # below and every employee gets a 403 on their own settings.
        if self.action in ('list', 'retrieve', 'me', 'change_password', 'preferences'):
            return [IsAuthenticated()]
        if self.action in ('update', 'partial_update'):
            return [IsAuthenticated(), IsSelfOrAdmin()]
        return [IsAdmin()]

    def get_serializer_class(self):
        return AdminUserSerializer if is_admin(self.request.user) else UserSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_admin(user):
            return qs
        if getattr(user, 'department_id', None):
            return qs.filter(department_id=user.department_id)
        return qs.filter(pk=user.pk)

    @action(detail=False, methods=['get'])
    def me(self, request):
        """The signed-in user. The frontend route guard reads is_staff here
        rather than trusting localStorage."""
        return Response(self.get_serializer(request.user).data)

    @action(detail=False, methods=['post'], url_path='change-password')
    def change_password(self, request):
        current = request.data.get('current_password')
        new = request.data.get('new_password')
        if not current or not new:
            return Response(
                {'detail': 'current_password and new_password are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(current):
            log_action(request.user, 'password_change_failed', ip=request.META.get('REMOTE_ADDR'))
            return Response({'detail': 'Current password is incorrect'},
                            status=status.HTTP_400_BAD_REQUEST)

        # AUTH_PASSWORD_VALIDATORS are configured in settings but were never
        # invoked here, so 'password' was an acceptable replacement.
        try:
            validate_password(new, user=request.user)
        except DjangoValidationError as exc:
            return Response({'new_password': exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new)
        request.user.save(update_fields=['password'])
        log_action(request.user, 'password_changed', ip=request.META.get('REMOTE_ADDR'))
        return Response({'detail': 'Password updated'})

    @action(detail=False, methods=['get', 'put', 'patch'], url_path='preferences')
    def preferences(self, request):
        """Notification and display settings for the signed-in user."""
        prefs, _ = UserPreference.objects.get_or_create(user=request.user)
        if request.method == 'GET':
            return Response(UserPreferenceSerializer(prefs).data)

        # Always partial, even for PUT: the settings UI saves one panel at a
        # time, and a strict PUT would reject every single-toggle body -- the
        # same defect that made the admin bulk-update button unusable.
        serializer = UserPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(request.user, 'preferences_updated', ip=request.META.get('REMOTE_ADDR'),
                   metadata={'fields': sorted(serializer.validated_data)})
        return Response(serializer.data)

    def perform_destroy(self, instance):
        log_action(self.request.user, 'delete_user',
                   ip=self.request.META.get('REMOTE_ADDR'),
                   metadata={'target': instance.email})
        instance.delete()


# ----------------------------------
# OTP LOGIN
# ----------------------------------

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
@csrf_exempt
def login_send_otp(request):
    email = request.data.get('email')
    password = request.data.get('password')
    if not email or not password:
        return Response({'detail': 'Email and password are required'}, status=status.HTTP_400_BAD_REQUEST)

    ip = request.META.get('REMOTE_ADDR')
    detection = settings.DETECTION
    window_start = timezone.now() - timedelta(minutes=detection['LOGIN_FAILURE_WINDOW_MINUTES'])

    attempted = User.objects.filter(email=email).first()

    # Count recent failures against the account when we can identify it, and
    # against the source IP when we cannot -- an attacker guessing addresses
    # produces rows with no actor, which a purely per-user counter would never
    # see.
    failures = AuditLog.objects.filter(action='login_failed', timestamp__gte=window_start)
    failures = (failures.filter(actor=attempted) if attempted is not None
                else failures.filter(actor__isnull=True, ip_address=ip))

    if failures.count() >= detection['LOGIN_LOCKOUT_THRESHOLD']:
        # Log the blocked attempt as well, mirroring verify_otp_and_token.
        # Returning early without logging would cap login_failed at the
        # lockout threshold -- exactly the number detect_failed_logins has to
        # exceed -- so the alert could never fire.
        log_action(attempted, 'login_failed', ip=ip,
                   metadata={'email': email, 'locked_out': True})
        return Response({'detail': 'Too many failed attempts. Try again later.'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)

    # authenticate() also rejects inactive users; the response is identical
    # for unknown emails and wrong passwords to prevent user enumeration.
    user = authenticate(request, username=email, password=password)
    if user is None:
        # Unknown addresses are recorded too, with actor=None and the address
        # in metadata. Previously they were silently swallowed, so credential
        # stuffing against non-existent accounts left no trace at all.
        log_action(attempted, 'login_failed', ip=ip, metadata={'email': email})
        return Response({'detail': 'Invalid email or password'}, status=status.HTTP_400_BAD_REQUEST)

    otp_code = get_random_string(length=6, allowed_chars='0123456789')

    # Create OTP record with expiry (e.g., 5 minutes from now)
    otp_instance = OTP.objects.create(
        user=user,
        code=otp_code,
        expires_at=timezone.now() + timedelta(minutes=5)
    )

    try:
        send_mail(
            'Your OTP Code',
            f'Your OTP code is: {otp_code}',
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
        log_action(user, 'otp_sent', ip=request.META.get('REMOTE_ADDR'))
        return Response({'detail': 'OTP sent successfully'})
    except Exception as e:
        logger.error(f"OTP email send failed: {e}", exc_info=True)
        otp_instance.delete()
        return Response({'detail': 'Failed to send OTP'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def logout_view(request):
    # 'logout' is part of the login→delete→logout sequence the detectors watch
    log_action(request.user, 'logout', ip=request.META.get('REMOTE_ADDR'))
    return Response({'detail': 'Logged out'})


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def verify_otp_and_token(request):
    try:
        email = request.data.get('email')
        code = request.data.get('otp')

        if not email or not code:
            return Response({'detail': 'Email and OTP are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'detail': 'Invalid or expired OTP'}, status=status.HTTP_400_BAD_REQUEST)

        detection = settings.DETECTION
        lockout_threshold = detection['OTP_LOCKOUT_THRESHOLD']

        # Lock out after repeated failures so a 6-digit code cannot be brute-forced
        window_start = timezone.now() - timedelta(minutes=detection['OTP_FAILURE_WINDOW_MINUTES'])
        recent_failures = AuditLog.objects.filter(
            actor=user, action='otp_failed', timestamp__gte=window_start
        ).count()
        if recent_failures >= lockout_threshold:
            # Log the blocked attempt too. Returning early without logging used
            # to cap otp_failed at exactly the lockout threshold, which is the
            # same number detect_failed_otp_bruteforce needs to *exceed* -- so
            # the detector could never fire. Recording it means the lockout and
            # the alert happen on the same request.
            log_action(user, 'otp_failed', ip=request.META.get('REMOTE_ADDR'),
                       metadata={'locked_out': True})
            return Response(
                {'detail': 'Too many failed attempts. Try again later.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        otp = OTP.objects.filter(user=user, code=code, expires_at__gte=timezone.now()).first()
        if otp is None:
            log_action(user, 'otp_failed', ip=request.META.get('REMOTE_ADDR'))
            return Response({'detail': 'Invalid or expired OTP'}, status=status.HTTP_400_BAD_REQUEST)

        # Single-use: consume this OTP and any stale ones for the user
        OTP.objects.filter(user=user).delete()

        tokens = get_tokens_for_user(user)

        # 'login' is the action name the detection engine watches for
        log_action(user, 'login', ip=request.META.get('REMOTE_ADDR'))

        return Response({'tokens': tokens, 'user': UserSerializer(user).data})

    except Exception as e:
        logger.error(f"Error in verify_otp_and_token: {e}", exc_info=True)
        return Response({'detail': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
# ----------------------------------
# RESOURCES MANAGEMENT
# ----------------------------------
# list_resources and resource_detail used to live here. Both were
# IsAuthenticated-only with no object checks, and both were already shadowed by
# ResourceViewSet's router routes. ResourceViewSet is now the single entry
# point for resource CRUD.


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def csrf_token_view(request):
    return JsonResponse({'csrfToken': get_token(request)})


@ensure_csrf_cookie
def get_csrf(request):
    return JsonResponse({'detail': 'CSRF cookie set'})


# GroupSerializer / GroupListAPIView / list_groups removed along with their
# routes. Django Groups were assignable in the admin UI but consulted by no
# permission check, so picking one granted nothing while the field that
# actually matters -- role -- was never sent at all.


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def upload_resource(request):
    """Upload a real file from the client's machine.

    multipart/form-data with a `file` part, plus optional `name` and
    `department`. The uploader is granted full_control, so they can then
    assign access to others via /api/resource/assign-access/.
    """
    if 'file' not in request.FILES:
        return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

    uploaded_file = request.FILES['file']
    user = request.user

    if uploaded_file.size > settings.MAX_UPLOAD_BYTES:
        limit_mb = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        return Response({'file': f'File exceeds the {limit_mb} MB limit'},
                        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    # basename() strips any directory component the client tried to smuggle in
    # via the upload filename.
    safe_name = os.path.basename(uploaded_file.name)
    extension = os.path.splitext(safe_name)[1].lower()
    if extension not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        return Response({'file': f'File type {extension or "(none)"} is not allowed'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Target department defaults to the uploader's own. Naming a different one
    # is a manager/admin action -- otherwise any employee could plant a file
    # inside Finance. Raised, not returned, so the denial is audited.
    dept = getattr(user, 'department', None)
    requested = request.data.get('department')
    if requested:
        target = Department.objects.filter(name__iexact=str(requested)).first()
        if target is None and str(requested).isdigit():
            target = Department.objects.filter(pk=int(requested)).first()
        if target is None:
            return Response({'department': 'Unknown department'},
                            status=status.HTTP_400_BAD_REQUEST)
        if target.pk != getattr(dept, 'pk', None) and not (
                is_admin(user) or role_level(user) >= LEVEL_MANAGER):
            raise PermissionDenied('You may only upload into your own department.')
        dept = target
    if dept is None:
        # Previously this silently did get_or_create(name='IT'), mislabelling
        # the file and creating a department as a side effect of an upload.
        return Response({'department': 'You have no department; specify one.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # basename the display name too -- only `path` used to be sanitised.
    display_name = os.path.basename(str(request.data.get('name') or safe_name))
    saved_path = default_storage.save(f"resources/{safe_name}", uploaded_file)
    resource = Resource.objects.create(
        name=display_name,
        path=saved_path,
        is_folder=False,
        department=dept,
        created_by=user,
    )
    AccessControl.objects.create(user=user, resource=resource, permission='full_control')
    log_action(user, 'resource_upload', resource=resource, ip=request.META.get('REMOTE_ADDR'),
               metadata={'size': uploaded_file.size, 'department': dept.name})
    return Response(ResourceSerializer(resource, context={'request': request}).data,
                    status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def download_resource(request, pk):
    resource = get_object_or_404(Resource, pk=pk)

    # Requires 'download' explicitly rather than the GET -> 'read' mapping in
    # ACTION_MAP. Without this, PERM_PRIORITY['download'] was required by
    # nothing and a bare 'read' grant was enough to take the bytes -- so the
    # two levels were indistinguishable. Raised (not returned) so the audited
    # exception handler records it as 'unauthorized_access'.
    if not may(request.user, resource, 'download'):
        raise PermissionDenied('Access denied')

    try:
        file_path = safe_media_path(resource.path)
    except SuspiciousFileOperation:
        # A stored path pointing outside MEDIA_ROOT is an exfiltration attempt,
        # not a 404. Deny it loudly so it lands in the audit trail.
        logger.warning('Blocked traversal attempt on resource %s (%r)', resource.pk, resource.path)
        raise PermissionDenied('Access denied')

    # is_file(), not exists(): an empty path resolves to MEDIA_ROOT itself,
    # which exists as a directory and would raise IsADirectoryError on open().
    if not resource.path or not file_path.is_file():
        return Response({'detail': 'File not found'}, status=404)

    # Log download
    log_action(request.user, 'download_resource', resource=resource, ip=request.META.get('REMOTE_ADDR'))
    return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=resource.name)

@api_view(['GET'])
@permission_classes([IsAdmin])
def audit_logs(request):
    # Admin-only: the audit trail covers every user, so it must not be
    # readable by ordinary employees. Newest first, capped for performance.
    try:
        limit = min(int(request.query_params.get('limit', 300)), 1000)
    except (TypeError, ValueError):
        limit = 300
    logs = AuditLog.objects.select_related('actor', 'resource').order_by('-timestamp')[:limit]
    serializer = AuditLogRowSerializer(logs, many=True)
    return Response({"audit_logs": serializer.data})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_roles(request):
    """Roles for the EditAccessDialog dropdown and the admin Role picker.

    `name` keeps its composite "Role (Department)" form because
    EditAccessDialog renders it directly; `label`, `level` and `department`
    are provided separately so the admin UI can show the privilege level and
    group by department.
    """
    roles = Role.objects.select_related('department').order_by('department__name', 'name')
    return Response([
        {
            'id': r.id,
            'name': f"{r.name} ({r.department.name})",
            'label': r.name,
            'level': r.level,
            'department': r.department.name,
        }
        for r in roles
    ])


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_departments(request):
    """Departments for the admin dropdowns, which were hardcoded to IT/Finance."""
    return Response(list(Department.objects.order_by('name').values('id', 'name')))


class ResourceViewSet(ResourceScopedQuerysetMixin, viewsets.ModelViewSet):
    """Full CRUD for Resource.

    Two layers, because they cover different gaps:
      * RoleEnforcer gates individual objects (retrieve/update/destroy), which
        is where DRF calls has_object_permission.
      * ResourceScopedQuerysetMixin narrows the *list*, which DRF never
        object-checks -- without it, every employee could enumerate every
        department's files.
    """
    queryset = Resource.objects.select_related('department', 'created_by')
    serializer_class = ResourceSerializer
    permission_classes = [IsAuthenticated, RoleEnforcer]

    def get_queryset(self):
        qs = super().get_queryset()   # mixin narrows list results to what's visible
        department = self.request.query_params.get('department')
        # List only. Filtering detail routes would 404 a cross-department fetch
        # before RoleEnforcer runs, so no 'unauthorized_access' row would be
        # written and the detection engine would lose that signal.
        if department and getattr(self, 'action', None) == 'list':
            if str(department).isdigit():
                qs = qs.filter(department_id=int(department))
            else:
                qs = qs.filter(department__name__iexact=department)
        return qs



    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user

        # Ensure department is set (as previous guidance)
        dept = getattr(user, 'department', None)
        if dept is None:
            from .models import Department
            dept, _ = Department.objects.get_or_create(name='IT')

        extra = {'created_by': user, 'department': dept}

        # Optional text content: written to MEDIA_ROOT so downloads serve
        # real bytes instead of pointing at paths that don't exist.
        content = self.request.data.get('content')
        is_folder = serializer.validated_data.get('is_folder', False)
        if content is not None and not is_folder:
            name = serializer.validated_data.get('name', 'file')
            base = os.path.basename(name).replace(' ', '_') or 'file'
            # Only append .txt when there is no extension already, so
            # "Q3.pdf" is not stored as "Q3.pdf.txt".
            stored_name = base if os.path.splitext(base)[1] else f'{base}.txt'
            extra['path'] = default_storage.save(
                f"resources/{stored_name}",
                ContentFile(content.encode('utf-8')),
            )

        resource = serializer.save(**extra)

        # Owner gets full control (RoleEnforcer also short-circuits on created_by)
        AccessControl.objects.create(user=user, resource=resource, permission='full_control')

        log_action(user, 'create_resource', resource=resource, ip=self.request.META.get('REMOTE_ADDR'))
        return resource


    def retrieve(self, request, *args, **kwargs):
        # object-level permission will be checked by RoleEnforcer.has_object_permission
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        # Log the access (view)
        log_action(request.user, 'view_resource', resource=instance, ip=request.META.get('REMOTE_ADDR'))
        # Optionally record a download if file served separately
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # will call permission checks
        log_action(request.user, 'delete_resource', resource=instance, ip=request.META.get('REMOTE_ADDR'))
        return super().destroy(request, *args, **kwargs)

# delete_resource, update_resource and update_user used to live here. All three
# were IsAuthenticated-only with no ownership or object checks, so any employee
# could delete or rewrite any resource and reset any account's password.
# ResourceViewSet and UserViewSet now handle those operations with object-level
# permission checks.


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assign_resource_access(request):
    """
    Payload:
    {
      "resource_id": 1,
      "role_id": 2,        # optional (role-level)
      "user_id": 3,        # optional (user-level)
      "permission": "read" # or full_control/write/delete/none
    }
    """
    user = request.user
    data = request.data
    resource_id = data.get('resource_id')
    role_id = data.get('role_id')
    user_id = data.get('user_id')
    permission = data.get('permission')

    if not resource_id or not permission:
        return Response({"error": "resource_id and permission required"}, status=400)

    valid_permissions = {choice for choice, _ in ACCESS_LEVELS}
    if permission not in valid_permissions:
        return Response(
            {"error": f"permission must be one of {sorted(valid_permissions)}"},
            status=400,
        )

    resource = get_object_or_404(Resource, pk=resource_id)

    # Granting access is a manager-grade action: admins, the resource owner, or
    # a role at manager level or above. Raised (not returned) so the denial is
    # audited as 'unauthorized_access'.
    if not (is_admin(user) or resource.created_by_id == user.id
            or role_level(user) >= LEVEL_MANAGER):
        raise PermissionDenied('You are not allowed to assign access to this resource.')

    if role_id:
        role = get_object_or_404(Role, pk=role_id)
        ra, created = ResourceAccess.objects.update_or_create(resource=resource, role=role,
                                                            defaults={'access_level': permission})
        action = 'created' if created else 'updated'
        log_action(user, f'assign_role_access_{action}', resource=resource, metadata={'role': role.name, 'perm': permission})
        return Response({"detail": f"Role access {action}"}, status=200)

    if user_id:
        tuser = get_object_or_404(User, pk=user_id)
        ac, created = AccessControl.objects.update_or_create(user=tuser, resource=resource, defaults={'permission': permission})
        action = 'created' if created else 'updated'
        log_action(user, f'assign_user_access_{action}', resource=resource, metadata={'user': tuser.email, 'perm': permission})
        return Response({"detail": f"User access {action}"}, status=200)

    return Response({"detail":"role_id or user_id required"}, status=400)
