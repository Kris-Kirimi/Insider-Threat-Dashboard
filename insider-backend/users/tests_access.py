"""Access-control regression tests.

Each test here pins a hole that was actually exploitable: privilege escalation
through the user update endpoint, cross-department resource disclosure, path
traversal into the project's secrets, and the OTP bypass.
"""
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from monitoring.models import Alert
from .models import AccessControl, AuditLog, Department, Resource, Role, User
from .permissions import effective_access

PASSWORD = 'S3curePass!'
MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class AccessControlTestBase(APITestCase):
    """Two departments, four users of differing authority, one file each."""

    @classmethod
    def setUpTestData(cls):
        cls.finance = Department.objects.create(name='Finance')
        cls.it = Department.objects.create(name='IT')

        cls.employee_role = Role.objects.create(name='Employee', department=cls.finance, level=1)
        cls.manager_role = Role.objects.create(name='Manager', department=cls.finance, level=3)
        cls.it_role = Role.objects.create(name='Employee', department=cls.it, level=1)

        cls.finance_emp = User.objects.create_user(
            email='fin.emp@example.com', password=PASSWORD, full_name='Fin Emp',
            department=cls.finance, role=cls.employee_role)
        cls.finance_mgr = User.objects.create_user(
            email='fin.mgr@example.com', password=PASSWORD, full_name='Fin Mgr',
            department=cls.finance, role=cls.manager_role)
        cls.it_emp = User.objects.create_user(
            email='it.emp@example.com', password=PASSWORD, full_name='It Emp',
            department=cls.it, role=cls.it_role)
        cls.admin = User.objects.create_superuser(
            email='admin@example.com', password=PASSWORD, full_name='Admin')

        cls.finance_doc = Resource.objects.create(
            name='forecast.txt',
            path=default_storage.save('resources/forecast.txt', ContentFile(b'secret numbers')),
            department=cls.finance, created_by=cls.finance_mgr)
        cls.it_doc = Resource.objects.create(
            name='topology.txt',
            path=default_storage.save('resources/topology.txt', ContentFile(b'network map')),
            department=cls.it, created_by=cls.it_emp)


class AdminEndpointsRequireStaffTests(AccessControlTestBase):
    """An ordinary employee must be refused everywhere the console reads."""

    def test_admin_endpoints_reject_employee(self):
        alert = Alert.objects.create(user=self.finance_emp, action='rapid_login',
                                     description='x', severity='medium')
        endpoints = [
            ('get', reverse('audit_logs')),
            ('get', reverse('alert-list')),
            ('get', reverse('risk-scores')),
            ('patch', reverse('alert-status', args=[alert.pk])),
            ('get', '/api/accesscontrol/resource-access/'),
        ]
        self.client.force_authenticate(self.finance_emp)
        for method, url in endpoints:
            with self.subTest(url=url):
                res = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(res.status_code, 403, f'{url} was not refused')

    def test_admin_endpoints_allow_admin(self):
        self.client.force_authenticate(self.admin)
        for url in (reverse('audit_logs'), reverse('alert-list'), reverse('risk-scores')):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_employee_cannot_create_or_delete_accounts(self):
        self.client.force_authenticate(self.finance_emp)
        created = self.client.post('/api/users/', {
            'email': 'intruder@example.com', 'full_name': 'X', 'password': 'Whatever123!',
        }, format='json')
        self.assertEqual(created.status_code, 403)
        self.assertFalse(User.objects.filter(email='intruder@example.com').exists())

        removed = self.client.delete(f'/api/users/{self.admin.pk}/')
        self.assertEqual(removed.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_removed_unprotected_routes_are_gone(self):
        """The duplicate endpoints that bypassed object permissions."""
        self.client.force_authenticate(self.finance_emp)
        for url in (f'/api/resource/{self.finance_doc.pk}/delete/',
                    f'/api/resource/{self.finance_doc.pk}/update/',
                    f'/api/users/{self.admin.pk}/update/',
                    '/api/resource/'):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_password_grant_token_endpoint_removed(self):
        """/api/token/ would hand out a token without the OTP second factor."""
        res = self.client.post('/api/token/',
                               {'email': self.admin.email, 'password': PASSWORD}, format='json')
        self.assertEqual(res.status_code, 404)


class PrivilegeEscalationTests(AccessControlTestBase):

    def test_self_update_cannot_grant_staff_or_role(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.patch(f'/api/users/{self.finance_emp.pk}/', {
            'is_staff': True,
            'role': self.manager_role.pk,
            'is_simulated_threat': False,
            'full_name': 'Renamed',
        }, format='json')
        self.assertEqual(res.status_code, 200)

        self.finance_emp.refresh_from_db()
        self.assertFalse(self.finance_emp.is_staff)
        self.assertEqual(self.finance_emp.role_id, self.employee_role.pk)
        self.assertEqual(self.finance_emp.full_name, 'Renamed')  # permitted field still works

    def test_employee_cannot_reset_an_admins_password(self):
        """The account-takeover path: any employee could set an admin's password.

        Refused with 404 rather than 403 because the admin is outside the
        employee's department scope, so the record is not addressable at all.
        """
        self.client.force_authenticate(self.finance_emp)
        res = self.client.patch(f'/api/users/{self.admin.pk}/',
                                {'password': 'pwned-by-employee'}, format='json')
        self.assertEqual(res.status_code, 404)

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(PASSWORD))
        self.assertFalse(self.admin.check_password('pwned-by-employee'))

    def test_employee_cannot_reset_a_colleagues_password(self):
        """Same department, so the record is visible -- IsSelfOrAdmin must refuse."""
        self.client.force_authenticate(self.finance_emp)
        res = self.client.patch(f'/api/users/{self.finance_mgr.pk}/',
                                {'password': 'pwned-by-colleague', 'full_name': 'Hacked'},
                                format='json')
        self.assertEqual(res.status_code, 403)

        self.finance_mgr.refresh_from_db()
        self.assertTrue(self.finance_mgr.check_password(PASSWORD))
        self.assertEqual(self.finance_mgr.full_name, 'Fin Mgr')

    def test_admin_can_still_manage_roles(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(f'/api/users/{self.finance_emp.pk}/',
                                {'role': self.manager_role.pk}, format='json')
        self.assertEqual(res.status_code, 200)
        self.finance_emp.refresh_from_db()
        self.assertEqual(self.finance_emp.role_id, self.manager_role.pk)

    def test_assign_access_requires_manager_level(self):
        """Proves Role.level is actually wired into an authorization decision."""
        payload = {'resource_id': self.finance_doc.pk,
                   'user_id': self.finance_emp.pk, 'permission': 'read'}

        self.client.force_authenticate(self.finance_emp)
        self.assertEqual(
            self.client.post(reverse('assign_resource_access'), payload, format='json').status_code,
            403)

        self.client.force_authenticate(self.finance_mgr)
        self.assertEqual(
            self.client.post(reverse('assign_resource_access'), payload, format='json').status_code,
            200)

    def test_employee_user_list_is_department_scoped(self):
        self.client.force_authenticate(self.finance_emp)
        emails = {u['email'] for u in self.client.get('/api/users/').json()}
        self.assertIn(self.finance_mgr.email, emails)
        self.assertNotIn(self.it_emp.email, emails)
        self.assertNotIn(self.admin.email, emails)


class CrossDepartmentIsolationTests(AccessControlTestBase):

    def test_listing_excludes_other_departments(self):
        self.client.force_authenticate(self.it_emp)
        ids = {r['id'] for r in self.client.get('/api/resources/').json()}
        self.assertIn(self.it_doc.pk, ids)
        self.assertNotIn(self.finance_doc.pk, ids)

    def test_admin_sees_everything(self):
        self.client.force_authenticate(self.admin)
        ids = {r['id'] for r in self.client.get('/api/resources/').json()}
        self.assertEqual({self.finance_doc.pk, self.it_doc.pk}, ids)

    def test_cross_department_fetch_is_denied_and_audited(self):
        """403 rather than 404 -- a 404 would hide the attempt from detection."""
        self.client.force_authenticate(self.it_emp)
        res = self.client.get(f'/api/resources/{self.finance_doc.pk}/')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AuditLog.objects.filter(
            actor=self.it_emp, action='unauthorized_access').exists())

    def test_cross_department_delete_is_denied(self):
        self.client.force_authenticate(self.it_emp)
        res = self.client.delete(f'/api/resources/{self.finance_doc.pk}/')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Resource.objects.filter(pk=self.finance_doc.pk).exists())

    def test_explicit_none_revokes_same_department_read(self):
        """A 'none' grant must beat the department fallback."""
        AccessControl.objects.create(
            user=self.finance_emp, resource=self.finance_doc, permission='none')
        self.client.force_authenticate(self.finance_emp)

        self.assertEqual(
            self.client.get(f'/api/resources/{self.finance_doc.pk}/').status_code, 403)
        ids = {r['id'] for r in self.client.get('/api/resources/').json()}
        self.assertNotIn(self.finance_doc.pk, ids)

    def test_same_department_read_is_allowed_by_default(self):
        self.client.force_authenticate(self.finance_emp)
        self.assertEqual(
            self.client.get(f'/api/resources/{self.finance_doc.pk}/').status_code, 200)


@override_settings(MEDIA_ROOT=MEDIA)
class PathTraversalTests(AccessControlTestBase):

    def test_path_is_not_writable_through_the_api(self):
        self.client.force_authenticate(self.finance_emp)
        created = self.client.post('/api/resources/', {
            'name': 'evil', 'is_folder': False, 'path': '../../.env',
        }, format='json')
        self.assertEqual(created.status_code, 201)

        resource = Resource.objects.get(pk=created.json()['id'])
        self.assertNotIn('..', resource.path)

    def test_download_refuses_a_path_outside_media_root(self):
        """Defence in depth for a row written outside the serializer."""
        resource = Resource.objects.create(
            name='escape', path='../../.env',
            department=self.finance, created_by=self.finance_emp)
        self.client.force_authenticate(self.finance_emp)

        res = self.client.get(reverse('download_resource', args=[resource.pk]))
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AuditLog.objects.filter(
            actor=self.finance_emp, action='unauthorized_access').exists())


class EffectiveAccessTests(AccessControlTestBase):
    """The serializer's label and the enforcer's verdict must never disagree."""

    def _label(self, user, resource):
        self.client.force_authenticate(user)
        res = self.client.get(f'/api/resources/{resource.pk}/')
        if res.status_code == 403:
            return 'none'
        return res.json()['access_for_current_user']

    def test_ui_label_matches_what_the_api_permits(self):
        from .permissions import PERM_PRIORITY, RoleEnforcer

        enforcer = RoleEnforcer()
        for user in (self.finance_emp, self.finance_mgr, self.it_emp, self.admin):
            for resource in (self.finance_doc, self.it_doc):
                label = self._label(user, resource)
                for action in ('read', 'write', 'delete'):
                    with self.subTest(user=user.email, resource=resource.name, action=action):
                        request = type('R', (), {'user': user, 'method': {
                            'read': 'GET', 'write': 'PUT', 'delete': 'DELETE'}[action]})()
                        allowed = enforcer.has_object_permission(request, None, resource)
                        implied = PERM_PRIORITY[label] >= PERM_PRIORITY[action]
                        self.assertEqual(
                            implied, allowed,
                            f'UI shows {label!r} but the API '
                            f'{"allows" if allowed else "refuses"} {action}')

    def test_admin_sees_full_control_not_none(self):
        """A superuser has no department, so the old serializer showed 'none'
        while the API happily served the file."""
        self.assertEqual(self._label(self.admin, self.finance_doc), 'full_control')

        self.client.force_authenticate(self.admin)
        res = self.client.get(reverse('download_resource', args=[self.finance_doc.pk]))
        self.assertEqual(res.status_code, 200)

    def test_same_department_manager_gets_write_and_delete(self):
        # The serializer used to hardcode 'read' for same-department users.
        self.assertEqual(effective_access(self.finance_mgr, self.finance_doc), 'full_control')
        other = Resource.objects.create(
            name='peer.txt', path='resources/peer.txt',
            department=self.finance, created_by=self.finance_emp)
        self.assertEqual(effective_access(self.finance_mgr, other), 'delete')

    def test_explicit_none_still_beats_department(self):
        AccessControl.objects.create(
            user=self.finance_emp, resource=self.finance_doc, permission='none')
        self.assertEqual(effective_access(self.finance_emp, self.finance_doc), 'none')


@override_settings(MEDIA_ROOT=MEDIA)
class DownloadRequiresDownloadLevelTests(AccessControlTestBase):
    """`read` must no longer be enough to take the bytes."""

    def test_read_grant_permits_viewing_but_not_downloading(self):
        AccessControl.objects.create(
            user=self.it_emp, resource=self.finance_doc, permission='read')
        self.client.force_authenticate(self.it_emp)

        self.assertEqual(
            self.client.get(f'/api/resources/{self.finance_doc.pk}/').status_code, 200)

        res = self.client.get(reverse('download_resource', args=[self.finance_doc.pk]))
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AuditLog.objects.filter(
            actor=self.it_emp, action='unauthorized_access').exists())

    def test_download_grant_permits_download_but_not_write(self):
        AccessControl.objects.create(
            user=self.it_emp, resource=self.finance_doc, permission='download')
        self.client.force_authenticate(self.it_emp)

        self.assertEqual(
            self.client.get(reverse('download_resource', args=[self.finance_doc.pk])).status_code,
            200)
        self.assertEqual(
            self.client.patch(f'/api/resources/{self.finance_doc.pk}/',
                              {'name': 'renamed'}, format='json').status_code, 403)

    def test_same_department_employee_can_still_download(self):
        """Pins DEPARTMENT_DEFAULT_ACCESS; flip it to 'read' and this fails."""
        self.client.force_authenticate(self.finance_emp)
        res = self.client.get(reverse('download_resource', args=[self.finance_doc.pk]))
        self.assertEqual(res.status_code, 200)

    def test_empty_path_returns_404_not_500(self):
        empty = Resource.objects.create(
            name='no-bytes', path='', department=self.finance, created_by=self.finance_emp)
        self.client.force_authenticate(self.finance_emp)
        res = self.client.get(reverse('download_resource', args=[empty.pk]))
        self.assertEqual(res.status_code, 404)


class AuditLogNullActorTests(AccessControlTestBase):

    def test_logs_endpoint_survives_rows_with_no_actor(self):
        """Failed logins against unknown addresses have no actor; without a
        string default the whole endpoint 500s."""
        AuditLog.objects.create(actor=None, action='login_failed',
                                metadata={'email': 'ghost@example.com'})
        self.client.force_authenticate(self.admin)
        res = self.client.get(reverse('audit_logs'))

        self.assertEqual(res.status_code, 200)
        users = {row['user'] for row in res.json()['audit_logs']}
        self.assertIn('(unknown)', users)
        self.assertNotIn(None, users)


class ExceptionHandlerSafetyTests(AccessControlTestBase):

    def test_anonymous_denial_is_not_audited_and_does_not_crash(self):
        res = self.client.get(reverse('audit_logs'))
        self.assertEqual(res.status_code, 401)
        self.assertEqual(
            AuditLog.objects.filter(action='unauthorized_access').count(), 0)

    def test_audit_failure_does_not_turn_403_into_500(self):
        from unittest.mock import patch
        self.client.force_authenticate(self.it_emp)
        with patch('users.exception_handlers.AuditLog.objects.create',
                   side_effect=RuntimeError('db down')):
            res = self.client.get(f'/api/resources/{self.finance_doc.pk}/')
        self.assertEqual(res.status_code, 403)

    def test_non_resource_denial_records_path_without_a_resource(self):
        alert = Alert.objects.create(user=self.finance_emp, action='x',
                                     description='x', severity='low')
        self.client.force_authenticate(self.finance_emp)
        self.client.patch(reverse('alert-status', args=[alert.pk]),
                          {'status': 'resolved'}, format='json')

        log = AuditLog.objects.filter(
            actor=self.finance_emp, action='unauthorized_access').latest('timestamp')
        self.assertIsNone(log.resource)
        self.assertIn('/api/monitoring/alerts/', log.metadata['path'])
