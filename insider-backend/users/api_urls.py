from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views
from .views import ResourceViewSet, UserViewSet

router = DefaultRouter()
router.register(r'resources', ResourceViewSet, basename='resource')
router.register(r'users', UserViewSet, basename='user')

# Mounted once, at /api/. (It used to be included twice -- at /api/ and
# /api/users/ -- which gave every route two URLs and was the only reason
# /api/users/ resolved at all.)
#
# Explicit paths come before the router so they are not shadowed by
# users/<pk>/ or resources/<pk>/.
urlpatterns = [
    path('audit/logs/', views.audit_logs, name='audit_logs'),

    path('resources/<int:pk>/download/', views.download_resource, name='download_resource'),
    path('resource/upload/', views.upload_resource, name='upload_resource'),
    path('resource/assign-access/', views.assign_resource_access, name='assign_resource_access'),

    path('roles/', views.list_roles, name='list_roles'),
    path('departments/', views.list_departments, name='list_departments'),
    path('logout/', views.logout_view, name='logout'),
    path('csrf/', views.csrf_token_view, name='csrf_token'),

    path('', include(router.urls)),
]
