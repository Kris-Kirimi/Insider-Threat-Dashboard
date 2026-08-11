from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import random
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view

# -------------------
# Default expiry for OTP
# -------------------
def default_expiry():
    return timezone.now() + timedelta(minutes=5)

# -------------------
# Custom User Manager
# -------------------
class UserManager(BaseUserManager):
    def create_user(self, email, password=None, full_name='', **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, full_name=full_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, full_name='', **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True or extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_staff=True and is_superuser=True.')
        return self.create_user(email, password, full_name=full_name, **extra_fields)

# -------------------
# Organization Models
# -------------------
class Department(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name

class Role(models.Model):
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, null=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='roles')
    level = models.PositiveSmallIntegerField(default=1)

    class Meta:
        unique_together = ('name', 'department')

    def __str__(self):
        return f"{self.name} ({self.department.name})"

# -------------------
# Custom User Model
# -------------------
class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    role = models.ForeignKey(Role, null=True, blank=True, on_delete=models.SET_NULL, related_name='users')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_simulated_threat = models.BooleanField(default=False, help_text="Flag user as insider threat simulation")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL, related_name='users')

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    def __str__(self):
        return self.email

class UserPreference(models.Model):
    """Per-user notification and display settings.

    Kept out of User so the toggle list can grow without touching the auth
    model's migration history. Rows are created lazily by the preferences
    endpoint, so existing accounts need no data migration.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preferences'
    )
    # Notifications
    alert_emails = models.BooleanField(default=True)
    activity_reports = models.BooleanField(default=False)
    email_notifications = models.BooleanField(default=True)
    # Display
    show_help_tooltips = models.BooleanField(default=True)
    compact_tables = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences for {self.user.email}"


# -------------------
# OTP Model
# -------------------
class OTP(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='otps')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_expiry)

    @staticmethod
    def generate_code():
        return f"{random.randint(100000, 999999):06d}"

    @classmethod
    def create_for_user(cls, user, minutes_valid=5):
        code = cls.generate_code()
        return cls.objects.create(
            user=user,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=minutes_valid)
        )

    def is_valid(self):
        return timezone.now() <= self.expires_at

    def __str__(self):
        return f"OTP({self.code}) for {self.user.email}"

# -------------------
# Resource & Access
# -------------------
ACCESS_LEVELS = (
    ('read', 'Read'),
    ('write', 'Write'),
    ('download', 'Download'),
    ('delete', 'Delete'),
    ('upload', 'Upload'),
    ('none', 'No Access'),
    ('full_control', 'Full Access')
)

class Resource(models.Model):
    name = models.CharField(max_length=255)
    path = models.CharField(max_length=1024, help_text='Path or S3 key')
    is_folder = models.BooleanField(default=False)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='resources')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='users_resources_created')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({'Folder' if self.is_folder else 'File'})"

class ResourceAccess(models.Model):
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='access_entries')
    role = models.ForeignKey(Role, null=True, blank=True, on_delete=models.CASCADE, related_name='resource_access')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name='resource_access')
    access_level = models.CharField(max_length=20, choices=ACCESS_LEVELS)

    class Meta:
        unique_together = ('resource', 'role', 'user')

    def __str__(self):
        target = self.user.email if self.user else (self.role.name if self.role else 'Unknown')
        return f"{target} → {self.resource.name} ({self.access_level})"

# -------------------
# Audit Log
# -------------------
class AuditLog(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=120)  # e.g., login, download, edit
    resource = models.ForeignKey(Resource, null=True, blank=True, on_delete=models.SET_NULL)
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    metadata = models.JSONField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.timestamp} - {self.actor} - {self.action}"

class AccessControl(models.Model):
    PERMISSION_CHOICES = [
        ('read', 'Read'),
        ('write', 'Write'),
        ('download', 'Download'),
        ('delete', 'Delete'),
        ('upload', 'Upload'),
        ('none', 'No Access'),
        ('full_control', 'Full Access')
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='access_controls')
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='access_controls')
    permission = models.CharField(max_length=100, choices=PERMISSION_CHOICES)


    class Meta:
        unique_together = ('user', 'resource')

    def __str__(self):
        return f"{self.user.email} - {self.resource.name} - {self.permission}"
    
