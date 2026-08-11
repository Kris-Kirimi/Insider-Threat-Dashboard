"""Admin API: role assignment, upload, preferences, department filtering.

These pin the faults the admin panel was reporting: roles that were never
assigned, a bulk-update that always 400'd, a files panel pointed at a URL that
did not exist, and an upload endpoint no UI could reach.
"""
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import AccessControl, AuditLog, Department, Resource, Role, User, UserPreference
from .permissions import LEVEL_MANAGER, effective_access, role_level

PASSWORD = 'S3curePass!'
MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class AdminApiTestBase(APITestCase):

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
            path=default_storage.save('resources/forecast.txt', ContentFile(b'numbers')),
            department=cls.finance, created_by=cls.finance_mgr)
        cls.it_doc = Resource.objects.create(
            name='topology.txt',
            path=default_storage.save('resources/topology.txt', ContentFile(b'map')),
            department=cls.it, created_by=cls.it_emp)


class RoleAssignmentTests(AdminApiTestBase):
    """The admin form never sent `role`, so every new account had none."""

    def test_admin_creates_user_with_a_working_role(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/users/', {
            'email': 'new.manager@example.com', 'full_name': 'New Manager',
            'department': 'Finance', 'role': self.manager_role.pk,
            'password': 'An0therStrong!Pass',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)

        created = User.objects.get(email='new.manager@example.com')
        self.assertEqual(created.role_id, self.manager_role.pk)
        self.assertEqual(created.department_id, self.finance.pk)
        self.assertEqual(role_level(created), LEVEL_MANAGER)
        self.assertEqual(res.data['role_name'], 'Manager')
        self.assertEqual(res.data['role_level'], 3)

    def test_admin_can_change_an_existing_users_role(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(f'/api/users/{self.finance_emp.pk}/',
                                {'role': self.manager_role.pk}, format='json')
        self.assertEqual(res.status_code, 200)
        self.finance_emp.refresh_from_db()
        self.assertEqual(role_level(self.finance_emp), LEVEL_MANAGER)

    def test_role_list_exposes_level_and_keeps_composite_name(self):
        self.client.force_authenticate(self.finance_emp)
        roles = self.client.get(reverse('list_roles')).json()
        manager = next(r for r in roles if r['id'] == self.manager_role.pk)
        self.assertEqual(manager['level'], 3)
        self.assertEqual(manager['label'], 'Manager')
        self.assertEqual(manager['department'], 'Finance')
        # EditAccessDialog renders `name` directly; it must stay composite.
        self.assertEqual(manager['name'], 'Manager (Finance)')

    def test_department_list_is_available(self):
        self.client.force_authenticate(self.finance_emp)
        names = {d['name'] for d in self.client.get(reverse('list_departments')).json()}
        self.assertEqual(names, {'Finance', 'IT'})


class BulkUpdateTests(AdminApiTestBase):
    """The bulk 'Apply Settings' action sent a single-key PUT and always 400'd."""

    def test_patch_with_a_single_field_succeeds(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(f'/api/users/{self.finance_emp.pk}/',
                                {'is_simulated_threat': True}, format='json')
        self.assertEqual(res.status_code, 200)
        self.finance_emp.refresh_from_db()
        self.assertTrue(self.finance_emp.is_simulated_threat)

    def test_put_with_a_single_field_is_rejected(self):
        """Pins *why* the client must use PATCH.

        `email` is intentionally writable (an admin must set it when creating
        an account), which makes it required on PUT.
        """
        self.client.force_authenticate(self.admin)
        res = self.client.put(f'/api/users/{self.finance_emp.pk}/',
                              {'is_simulated_threat': True}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('email', res.data)


class GroupRemovedTests(AdminApiTestBase):

    def test_group_routes_are_gone(self):
        self.client.force_authenticate(self.admin)
        for url in ('/api/groups/', '/api/groups-list/'):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_posting_a_group_is_ignored(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/users/', {
            'email': 'nogroup@example.com', 'full_name': 'No Group',
            'group': 'Managers', 'password': 'An0therStrong!Pass',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(User.objects.get(email='nogroup@example.com').groups.count(), 0)


@override_settings(MEDIA_ROOT=MEDIA)
class UploadResourceTests(AdminApiTestBase):

    def _upload(self, filename='report.pdf', content=b'%PDF-1.4 data', **extra):
        """`filename` is the uploaded file's own name; `extra` carries form
        fields such as `name` (display name) and `department`."""
        return self.client.post(
            reverse('upload_resource'),
            {'file': SimpleUploadedFile(filename, content), **extra},
            format='multipart',
        )

    def test_real_file_upload_creates_a_downloadable_resource(self):
        self.client.force_authenticate(self.finance_emp)
        res = self._upload()
        self.assertEqual(res.status_code, 201, res.data)

        resource = Resource.objects.get(pk=res.data['id'])
        self.assertEqual(resource.department_id, self.finance.pk)
        self.assertTrue(default_storage.exists(resource.path))
        self.assertTrue(AccessControl.objects.filter(
            user=self.finance_emp, resource=resource, permission='full_control').exists())
        self.assertTrue(AuditLog.objects.filter(
            actor=self.finance_emp, action='resource_upload').exists())

        # The uploaded bytes are actually retrievable.
        download = self.client.get(reverse('download_resource', args=[resource.pk]))
        self.assertEqual(download.status_code, 200)

    def test_oversize_upload_is_rejected(self):
        self.client.force_authenticate(self.finance_emp)
        with override_settings(MAX_UPLOAD_BYTES=10):
            res = self._upload(content=b'x' * 50)
        self.assertEqual(res.status_code, 413)

    def test_disallowed_extension_is_rejected(self):
        self.client.force_authenticate(self.finance_emp)
        res = self._upload(filename='payload.exe', content=b'MZ')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Resource.objects.filter(name='payload.exe').exists())

    def test_employee_cannot_upload_into_another_department(self):
        self.client.force_authenticate(self.finance_emp)
        res = self._upload(department='IT')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AuditLog.objects.filter(
            actor=self.finance_emp, action='unauthorized_access').exists())

    def test_manager_may_target_another_department(self):
        self.client.force_authenticate(self.finance_mgr)
        res = self._upload(department='IT')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Resource.objects.get(pk=res.data['id']).department_id, self.it.pk)

    def test_display_name_traversal_is_stripped(self):
        self.client.force_authenticate(self.finance_emp)
        res = self._upload(name='../../evil.txt')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Resource.objects.get(pk=res.data['id']).name, 'evil.txt')

    def test_departmentless_user_gets_an_error_not_an_invented_department(self):
        loner = User.objects.create_user(
            email='loner@example.com', password=PASSWORD, full_name='Loner')
        self.client.force_authenticate(loner)
        res = self._upload()
        self.assertEqual(res.status_code, 400)
        # The old code did get_or_create(name='IT'), creating a department as a
        # side effect of an upload.
        self.assertEqual(Department.objects.filter(name='IT').count(), 1)


class DepartmentFilterTests(AdminApiTestBase):

    def test_list_can_be_filtered_by_department_name(self):
        self.client.force_authenticate(self.admin)
        ids = {r['id'] for r in self.client.get('/api/resources/?department=Finance').json()}
        self.assertEqual(ids, {self.finance_doc.pk})

    def test_list_can_be_filtered_by_department_id(self):
        self.client.force_authenticate(self.admin)
        ids = {r['id'] for r in self.client.get(f'/api/resources/?department={self.it.pk}').json()}
        self.assertEqual(ids, {self.it_doc.pk})

    def test_filter_does_not_turn_a_denial_into_a_404(self):
        """Detail routes stay unfiltered so denials remain visible to detection."""
        self.client.force_authenticate(self.it_emp)
        res = self.client.get(f'/api/resources/{self.finance_doc.pk}/?department=IT')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(AuditLog.objects.filter(
            actor=self.it_emp, action='unauthorized_access').exists())


class UserPreferenceTests(AdminApiTestBase):

    def test_preferences_are_created_on_first_read(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.get('/api/users/preferences/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['alert_emails'])
        self.assertFalse(res.data['compact_tables'])
        self.assertTrue(UserPreference.objects.filter(user=self.finance_emp).exists())

    def test_single_toggle_patch_persists(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.patch('/api/users/preferences/',
                                {'compact_tables': True}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(UserPreference.objects.get(user=self.finance_emp).compact_tables)

    def test_put_with_one_key_is_accepted_as_partial(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.put('/api/users/preferences/',
                              {'activity_reports': True}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_preferences_are_per_user(self):
        self.client.force_authenticate(self.finance_emp)
        self.client.patch('/api/users/preferences/', {'compact_tables': True}, format='json')

        self.client.force_authenticate(self.it_emp)
        res = self.client.get('/api/users/preferences/')
        self.assertFalse(res.data['compact_tables'])


class ChangePasswordTests(AdminApiTestBase):

    def test_weak_password_is_rejected_by_the_validators(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.post('/api/users/change-password/', {
            'current_password': PASSWORD, 'new_password': 'password',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('new_password', res.data)

        self.finance_emp.refresh_from_db()
        self.assertTrue(self.finance_emp.check_password(PASSWORD))

    def test_strong_password_is_accepted(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.post('/api/users/change-password/', {
            'current_password': PASSWORD, 'new_password': 'Str0ng!Replacement42',
        }, format='json')
        self.assertEqual(res.status_code, 200)

        self.finance_emp.refresh_from_db()
        self.assertTrue(self.finance_emp.check_password('Str0ng!Replacement42'))

    def test_wrong_current_password_is_audited(self):
        self.client.force_authenticate(self.finance_emp)
        res = self.client.post('/api/users/change-password/', {
            'current_password': 'not-it', 'new_password': 'Str0ng!Replacement42',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(AuditLog.objects.filter(
            actor=self.finance_emp, action='password_change_failed').exists())
