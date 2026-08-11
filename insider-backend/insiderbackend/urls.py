from django.contrib import admin
from django.urls import path, include
from . import views
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.auth_urls')),
    path('', views.home_view),
    # No TokenObtainPairView: issuing a token from email+password alone would
    # bypass the OTP second factor entirely. Tokens are only minted by
    # /api/auth/verify-otp/. Refresh stays, since the frontend relies on it.
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('users.api_urls')),
    path('api/monitoring/', include('monitoring.urls')),
    path('', include('accesscontrol.urls')),
]



if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
