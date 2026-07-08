# users/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from .models import Department, Role, Resource, ResourceAccess, AuditLog, AccessControl, User
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


# User Serializer
class UserSerializer(serializers.ModelSerializer):
    department = serializers.CharField(source='department.name', default=None, read_only=True)
    role_name = serializers.CharField(source='role.name', default=None, read_only=True)
    is_staff = serializers.BooleanField(read_only=True)
    group = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'department', 'role', 'role_name',
            'is_staff', 'group', 'password', 'is_simulated_threat'
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
        }

    def create(self, validated_data):
        group_name = validated_data.pop('group', None)
        password = validated_data.pop('password', None)
        user = User(**validated_data)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()

        if group_name:
            group, _ = Group.objects.get_or_create(name=group_name)
            user.groups.add(group)

        return user

    def update(self, instance, validated_data):
        group_name = validated_data.pop('group', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        if group_name is not None:
            group, _ = Group.objects.get_or_create(name=group_name)
            instance.groups.clear()
            instance.groups.add(group)

        return instance

# Resource Serializer
class ResourceSerializer(serializers.ModelSerializer):
    department = serializers.CharField(source='department.name', read_only=True)
    created_by = serializers.CharField(source='created_by.email', read_only=True)
    access_for_current_user = serializers.SerializerMethodField()

    class Meta:
        model = Resource
        fields = ('id','name','path','is_folder','department','created_by','created_at','access_for_current_user')
    
    def get_access_for_current_user(self, obj):
        request = self.context.get('request', None)
        if not request or not request.user.is_authenticated:
            return 'none'
        user = request.user
        # check AccessControl
        ac = AccessControl.objects.filter(user=user, resource=obj).first()
        if ac:
            return ac.permission
        # check Role
        if getattr(user,'role',None):
            ra = ResourceAccess.objects.filter(resource=obj, role=user.role).first()
            if ra:
                return ra.access_level
        # owner fallback
        if obj.created_by_id == user.id:
            return 'full_control'
        # department fallback
        if getattr(user,'department',None) and obj.department == user.department:
            return 'read'
        return 'none'


# Resource Access Serializer
class ResourceAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceAccess
        fields = '__all__'


# Audit Log Serializer
class AuditLogSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)
    resource = ResourceSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = '__all__'



class AccessControlSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessControl
        fields = '__all__'

# users/serializers.py


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name']
