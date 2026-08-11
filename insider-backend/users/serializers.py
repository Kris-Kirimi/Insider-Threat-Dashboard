# users/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    Department, Role, Resource, ResourceAccess, AuditLog, AccessControl,
    User, UserPreference,
)
from .permissions import effective_access
from rest_framework import serializers

User = get_user_model()


# Department Serializer
class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'


# Role Serializer
class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = '__all__'


# -------------------------------------------------------------------------
# User serializers
#
# Two variants, chosen by UserViewSet.get_serializer_class():
#
#   UserSerializer      -- what a non-admin sees and may write. Only full_name
#                          is writable, so a self-PATCH carrying role/is_staff/
#                          password succeeds but silently changes nothing.
#                          (DRF ignores unknown and read-only input.)
#   AdminUserSerializer -- staff-only. Adds the privileged fields.
#
# The previous single serializer exposed `role` and `password` as writable to
# everyone, which combined with an unguarded update view allowed any employee
# to reset an administrator's password.
# -------------------------------------------------------------------------
class UserSerializer(serializers.ModelSerializer):
    department = serializers.CharField(source='department.name', default=None, read_only=True)
    role_name = serializers.CharField(source='role.name', default=None, read_only=True)
    role_level = serializers.IntegerField(source='role.level', default=None, read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'department',
            'role_name', 'role_level', 'is_staff',
        ]
        read_only_fields = ['id', 'email', 'is_staff']


class AdminUserSerializer(UserSerializer):
    # Writable by name so the admin UI can keep sending {"department": "Finance"};
    # it also serializes as the name, matching the read-only field it replaces.
    department = serializers.SlugRelatedField(
        slug_field='name', queryset=Department.objects.all(),
        required=False, allow_null=True,
    )
    is_staff = serializers.BooleanField(required=False)
    password = serializers.CharField(write_only=True, required=False)

    class Meta(UserSerializer.Meta):
        # `role` is the important one: it is what every authorization decision
        # reads. Django Groups were removed -- no permission check consulted
        # them, so assigning one granted nothing.
        fields = UserSerializer.Meta.fields + [
            'role', 'password', 'is_simulated_threat',
        ]
        # Deliberately just ['id'], NOT the parent's ['id','email','is_staff']:
        # an admin must be able to set `email` when *creating* an account.
        # The consequence is that `email` is required on PUT, so partial
        # updates must use PATCH. Pinned by tests_admin_api.BulkUpdateTests.
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()
        return instance

# Resource Serializer
class ResourceSerializer(serializers.ModelSerializer):
    department = serializers.CharField(source='department.name', read_only=True)
    created_by = serializers.CharField(source='created_by.email', read_only=True)
    access_for_current_user = serializers.SerializerMethodField()

    class Meta:
        model = Resource
        fields = ('id','name','path','is_folder','department','created_by','created_at','access_for_current_user')
        # `path` is deliberately read-only: it is joined onto MEDIA_ROOT when
        # serving downloads, so a writable value ('../.env') would be a path
        # traversal into the project's secrets. department/created_by are set
        # server-side in perform_create. The admin UI still sends `path` on
        # update; DRF ignores read-only input, so those requests keep working
        # and simply no longer move the file.
        read_only_fields = ('path', 'department', 'created_by', 'created_at')


    def get_access_for_current_user(self, obj):
        # Delegates to the same resolver RoleEnforcer uses, so the access
        # level shown in the UI always matches what the API will allow. This
        # was previously a second copy of the precedence chain and had drifted
        # from it in two ways: no admin branch, and a hardcoded 'read' for
        # same-department users that ignored manager privileges.
        request = self.context.get('request', None)
        if request is None:
            return 'none'
        return effective_access(request.user, obj)


# Resource Access Serializer
class ResourceAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceAccess
        fields = '__all__'


# Audit Log Serializer
class AuditLogRowSerializer(serializers.ModelSerializer):
    """Flat audit row for the admin Threat Logs table.

    `default='(unknown)'` is load-bearing, and must be a string rather than
    None. AuditLog.actor is nullable -- it is SET_NULL when a user is deleted,
    and failed logins against an unknown email address are recorded with no
    actor at all. Without a default, DRF re-raises the AttributeError from
    getattr(None, 'email') and the whole endpoint 500s; with None, the client
    crashes instead, because the logs page calls log.user.toLowerCase().
    """
    user = serializers.CharField(source='actor.email', default='(unknown)', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['user', 'action', 'timestamp']



class AccessControlSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessControl
        fields = '__all__'


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = [
            'alert_emails', 'activity_reports', 'email_notifications',
            'show_help_tooltips', 'compact_tables', 'updated_at',
        ]
        read_only_fields = ['updated_at']
        # `user` is deliberately absent: the row is always resolved from
        # request.user, so it cannot be pointed at someone else's account.

# users/serializers.py


# GroupSerializer removed: Django Groups are not consulted by any permission
# check in this project. Authorization reads users.Role exclusively.
