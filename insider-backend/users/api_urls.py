from django.urls import path, include
from . import views
from .views import GroupListAPIView, ResourceViewSet
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'resources', ResourceViewSet, basename='resource')

urlpatterns = [
    path('', views.list_users, name='list_users'),
    path('', include(router.urls)),

    # Resource list/create and resource detail (GET/PUT/DELETE)
    path('resource/', views.list_resources, name='list_resources'),
    path('resources/', views.list_resources, name='list_resources'),                # GET list, POST create
    path('resources/<int:pk>/', views.resource_detail, name='resource_detail'),     # GET, PUT, DELETE

    # Download (keeps existing pattern but pluralized for consistency)
    path('resources/<int:pk>/download/', views.download_resource, name='download_resource'),

    # other endpoints
    path('department/resources/', views.department_resources, name='department_resources'),
    path('resource/upload/', views.upload_resource, name='upload_resource'),
    path('resource/assign-access/', views.assign_resource_access, name='assign_resource_access'),
    path('resource/<int:pk>/delete/', views.delete_resource, name='delete_resource'),
    path('resource/<int:pk>/update/', views.update_resource, name='update_resource'),
    path('logout/', views.logout_view, name='logout'),
    path('audit/logs/', views.audit_logs, name='audit_logs'),
    path('csrf/', views.csrf_token_view, name='csrf_token'),
    path('groups/', GroupListAPIView.as_view(), name='group-list'),
    path('users/<int:pk>/update/', views.update_user, name='update_user'),
    path('groups-list/', views.list_groups, name='list_groups'),
     
]

