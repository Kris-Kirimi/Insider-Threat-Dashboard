from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import Group
from django.core.mail import send_mail
from django.http import FileResponse, Http404, JsonResponse
from django.utils.crypto import get_random_string
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from rest_framework import status, permissions, generics, viewsets, serializers
from datetime import timedelta
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from django.utils import timezone
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny, IsAuthenticated
from .models import Resource, AccessControl
from .serializers import UserSerializer, ResourceSerializer, AccessControlSerializer
from .models import User, OTP, Resource, AuditLog, Department, Role
from rest_framework.serializers import ModelSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q
from .permissions import RoleEnforcer
from .models import ResourceAccess
from django.db import transaction

import os
import logging

logger = logging.getLogger(__name__)

User = get_user_model()

# ----------------------------------
# USER MANAGEMENT
# ----------------------------------
@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def list_users(request):
    if request.method == 'GET':
        users = User.objects.all()
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            try:
                user = serializer.save()
                group_name = request.data.get('group')
                if group_name:
                    group, _ = Group.objects.get_or_create(name=group_name)
                    user.groups.add(group)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            except Exception as e:
                logger.error(f"Error creating user: {e}", exc_info=True)
                return Response({'detail': 'Server error while creating user'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            return Response({'detail': 'Validation error', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)



# Helper: generate JWT tokens for user
def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}

def log_action(actor, action, resource=None, ip=None, metadata=None):
    AuditLog.objects.create(actor=actor, action=action, resource=resource, ip_address=ip, metadata=metadata or {})

@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([permissions.IsAuthenticated])
def user_detail(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data)

    elif request.method == 'PUT':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response({'detail': 'Validation error', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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

    # authenticate() also rejects inactive users; the response is identical
    # for unknown emails and wrong passwords to prevent user enumeration.
    user = authenticate(request, username=email, password=password)
    if user is None:
        try:
            attempted = User.objects.get(email=email)
            log_action(attempted, 'login_failed', ip=request.META.get('REMOTE_ADDR'))
        except User.DoesNotExist:
            pass
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


OTP_MAX_FAILURES = 5
OTP_FAILURE_WINDOW_MINUTES = 15

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

        # Lock out after repeated failures so a 6-digit code cannot be brute-forced
        window_start = timezone.now() - timedelta(minutes=OTP_FAILURE_WINDOW_MINUTES)
        recent_failures = AuditLog.objects.filter(
            actor=user, action='otp_failed', timestamp__gte=window_start
        ).count()
        if recent_failures >= OTP_MAX_FAILURES:
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
@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def list_resources(request):
    if request.method == 'GET':
        resources = Resource.objects.all()
        serializer = ResourceSerializer(resources, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        serializer = ResourceSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response({'detail': 'Validation error', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([permissions.IsAuthenticated])
def resource_detail(request, pk):
    try:
        resource = Resource.objects.get(pk=pk)
    except Resource.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = ResourceSerializer(resource)
        return Response(serializer.data)

    elif request.method == 'PUT':
        serializer = ResourceSerializer(resource, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response({'detail': 'Validation error', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        resource.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
def csrf_token_view(request):
    return JsonResponse({'csrfToken': get_token(request)})


@ensure_csrf_cookie
def get_csrf(request):
    return JsonResponse({'detail': 'CSRF cookie set'})


class GroupSerializer(ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name']

class GroupListAPIView(generics.ListAPIView):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    permission_classes = [IsAuthenticated]


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def department_resources(request):
    data = {
        "department": "IT",
        "resources": [
            {"id": 1, "name": "Resource A", "type": "Document"},
            {"id": 2, "name": "Resource B", "type": "Tool"},
        ]
    }
    return Response(data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def upload_resource(request):
    if 'file' in request.FILES:
        uploaded_file = request.FILES['file']
        # TODO: Save the uploaded file properly
        return Response(
            {"message": f"File '{uploaded_file.name}' uploaded successfully"},
            status=status.HTTP_201_CREATED
        )
    return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def download_resource(request, pk):
    resource = get_object_or_404(Resource, pk=pk)

    perm = RoleEnforcer()
    # has_object_permission returns True/False
    if not perm.has_object_permission(request, None, resource):
        # 'unauthorized_access' is the action name the detection engine watches for
        log_action(request.user, 'unauthorized_access', resource=resource, ip=request.META.get('REMOTE_ADDR'))
        return Response({'detail': 'Access denied'}, status=403)

    file_path = os.path.join(settings.MEDIA_ROOT, resource.path)
    if not os.path.exists(file_path):
        return Response({'detail': 'File not found'}, status=404)

    # Log download
    log_action(request.user, 'download_resource', resource=resource, ip=request.META.get('REMOTE_ADDR'))
    return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=resource.name)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def audit_logs(request):
    logs = AuditLog.objects.all().order_by('-timestamp')  # fetch real logs, newest first
    serializer = AuditLogSerializer(logs, many=True)
    return Response({"audit_logs": serializer.data})

class AuditLogSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source='actor.email')  # adjust if your AuditLog has an actor FK to User

    class Meta:
        model = AuditLog
        fields = ['user', 'action', 'timestamp']  # or your real model fields

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_groups(request):
    groups = Group.objects.all()
    serializer = GroupSerializer(groups, many=True)
    return Response(serializer.data)

class ResourceViewSet(viewsets.ModelViewSet):

    """
    Full CRUD for Resource with RBAC enforced by RoleEnforcer.
    """
    queryset = Resource.objects.all()
    serializer_class = ResourceSerializer
    permission_classes = [IsAuthenticated, RoleEnforcer]



    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user

        # Ensure department is set (as previous guidance)
        dept = getattr(user, 'department', None)
        if dept is None:
            from .models import Department
            dept, _ = Department.objects.get_or_create(name='IT')

        resource = serializer.save(created_by=user, department=dept)

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

@api_view(['DELETE'])
@permission_classes([permissions.IsAuthenticated])
def delete_resource(request, pk):
    try:
        resource = Resource.objects.get(pk=pk)
    except Resource.DoesNotExist:
        return Response({'error': 'Resource not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        resource.delete()
        log_action(request.user, 'delete_resource', resource=resource, ip=request.META.get('REMOTE_ADDR'))
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response({'error': 'Method not allowed'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

@api_view(['PUT'])
@permission_classes([permissions.IsAuthenticated])
def update_resource(request, pk):
    try:
        resource = Resource.objects.get(pk=pk)
    except Resource.DoesNotExist:
        return Response({'error': 'Resource not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = ResourceSerializer(resource, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        log_action(request.user, 'update_resource', resource=resource, ip=request.META.get('REMOTE_ADDR'))
        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
def update_user(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PUT':
        serializer = UserSerializer(user, data=request.data)
    elif request.method == 'PATCH':
        serializer = UserSerializer(user, data=request.data, partial=True)

    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)

    return Response({'error': 'Invalid data'}, status=status.HTTP_400_BAD_REQUEST)

# users/views.py
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

    resource = get_object_or_404(Resource, pk=resource_id)

    # Only allow owner or manager or superuser to assign access
    perm_checker = RoleEnforcer()
    if not (user.is_superuser or resource.created_by_id == user.id or getattr(user.role,'level',0) >= 3):
        return Response({"detail":"Not allowed"}, status=403)

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
