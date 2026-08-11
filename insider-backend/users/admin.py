from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, OTP, Department, Role, Resource, ResourceAccess, AuditLog

class OTPInline(admin.TabularInline):
    model = OTP
    extra = 0
    readonly_fields = ('code','created_at','expires_at')
    can_delete = True

class UserAdmin(BaseUserAdmin):
    ordering = ['email']
    list_display = ['email', 'full_name', 'department', 'role', 'is_staff', 'is_active']
    # Filter and group by role, not Django Groups -- role is what the
    # permission layer actually reads.
    list_filter = ['is_staff','is_active','department','role']
    search_fields = ['email','full_name']
    filter_horizontal = ('user_permissions',)
    fieldsets = (
        (None, {'fields': ('email','password')}),
        ('Personal', {'fields': ('full_name','department','role')}),
        ('Permissions', {'fields': ('is_active','is_staff','is_superuser','user_permissions')}),
        ('Important dates', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (None, {'classes':('wide',),'fields':('email','full_name','password1','password2','is_staff','is_superuser')}),
    )
    inlines = [OTPInline]

admin.site.register(User, UserAdmin)
admin.site.register(OTP)
admin.site.register(Department)
admin.site.register(Role)
admin.site.register(Resource)
admin.site.register(ResourceAccess)
admin.site.register(AuditLog)
