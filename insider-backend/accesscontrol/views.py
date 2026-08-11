from rest_framework import permissions, viewsets

from users.permissions import IsManagerOrAdmin, is_admin
from users.scoping import scope_resources_for

from .models import ResourceAccess
from .serializers import ResourceAccessSerializer


class ResourceAccessViewSet(viewsets.ModelViewSet):
    """The access-control matrix itself.

    Previously IsAuthenticated with an unfiltered queryset, which let any
    employee read the whole permission matrix and grant themselves new access.
    Now it requires manager-grade authority, and non-admins only see rows for
    resources already within their own scope.
    """
    queryset = ResourceAccess.objects.select_related('user', 'resource')
    serializer_class = ResourceAccessSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        if is_admin(self.request.user):
            return qs
        return qs.filter(resource__in=scope_resources_for(self.request.user))
