import tempfile
from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import OTP, AccessControl, AuditLog, Department, Resource, User


def make_user(email='alice@example.com', password='S3curePass!', department=None, **extra):
    return User.objects.create_user(
        email=email, password=password, full_name='Test User',
        department=department, **extra,
    )


class LoginSendOtpTests(APITestCase):
    def setUp(self):
        self.url = reverse('login_send_otp')
        self.user = make_user()

    def test_password_is_required(self):
        res = self.client.post(self.url, {'email': self.user.email})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(OTP.objects.count(), 0)

    def test_wrong_password_is_rejected_and_audited(self):
        res = self.client.post(self.url, {'email': self.user.email, 'password': 'wrong'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(OTP.objects.count(), 0)
        self.assertTrue(AuditLog.objects.filter(actor=self.user, action='login_failed').exists())

    def test_unknown_email_gets_same_error_as_wrong_password(self):
        wrong_pw = self.client.post(self.url, {'email': self.user.email, 'password': 'wrong'})
        unknown = self.client.post(self.url, {'email': 'ghost@example.com', 'password': 'wrong'})
        self.assertEqual(wrong_pw.status_code, unknown.status_code)
        self.assertEqual(wrong_pw.json()['detail'], unknown.json()['detail'])

    def test_valid_credentials_send_otp(self):
        res = self.client.post(self.url, {'email': self.user.email, 'password': 'S3curePass!'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(OTP.objects.filter(user=self.user).count(), 1)
        self.assertTrue(AuditLog.objects.filter(actor=self.user, action='otp_sent').exists())


class VerifyOtpTests(APITestCase):
    def setUp(self):
        self.url = reverse('verify_otp')
        self.user = make_user()
        self.otp = OTP.create_for_user(self.user)

    def test_valid_otp_returns_tokens_and_logs_login(self):
        res = self.client.post(self.url, {'email': self.user.email, 'otp': self.otp.code})
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.json()['tokens'])
        self.assertTrue(AuditLog.objects.filter(actor=self.user, action='login').exists())

    def test_otp_is_single_use(self):
        first = self.client.post(self.url, {'email': self.user.email, 'otp': self.otp.code})
        self.assertEqual(first.status_code, 200)
        replay = self.client.post(self.url, {'email': self.user.email, 'otp': self.otp.code})
        self.assertEqual(replay.status_code, 400)

    def test_wrong_otp_is_audited_as_failure(self):
        res = self.client.post(self.url, {'email': self.user.email, 'otp': '000000'})
        self.assertEqual(res.status_code, 400)
        self.assertTrue(AuditLog.objects.filter(actor=self.user, action='otp_failed').exists())

    def test_rate_limited_after_repeated_failures(self):
        for _ in range(5):
            AuditLog.objects.create(actor=self.user, action='otp_failed')
        res = self.client.post(self.url, {'email': self.user.email, 'otp': self.otp.code})
        self.assertEqual(res.status_code, 429)

    def test_expired_otp_is_rejected(self):
        OTP.objects.filter(pk=self.otp.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
        res = self.client.post(self.url, {'email': self.user.email, 'otp': self.otp.code})
        self.assertEqual(res.status_code, 400)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ResourceAccessTests(APITestCase):
    def setUp(self):
        self.finance = Department.objects.create(name='Finance')
        self.it = Department.objects.create(name='IT')
        self.owner = make_user('owner@example.com', department=self.finance)
        self.outsider = make_user('outsider@example.com', department=self.it)
        path = default_storage.save('resources/plan.txt', ContentFile(b'quarterly plan'))
        self.resource = Resource.objects.create(
            name='plan.txt', path=path, department=self.finance, created_by=self.owner,
        )
        AccessControl.objects.create(user=self.owner, resource=self.resource, permission='full_control')
        self.url = reverse('download_resource', args=[self.resource.pk])

    def test_owner_can_download(self):
        self.client.force_authenticate(self.owner)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(AuditLog.objects.filter(actor=self.owner, action='download_resource').exists())

    def test_other_department_is_denied_and_audited(self):
        self.client.force_authenticate(self.outsider)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 403)
        self.assertTrue(
            AuditLog.objects.filter(actor=self.outsider, action='unauthorized_access').exists()
        )

    def test_explicit_grant_allows_download(self):
        AccessControl.objects.create(user=self.outsider, resource=self.resource, permission='download')
        self.client.force_authenticate(self.outsider)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)

    def test_anonymous_is_rejected(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 401)


class AdminEndpointAccessTests(APITestCase):
    def setUp(self):
        self.url = reverse('audit_logs')
        self.employee = make_user('emp@example.com')
        self.admin = User.objects.create_superuser(
            email='admin@example.com', password='S3curePass!', full_name='Admin',
        )

    def test_employee_cannot_read_audit_logs(self):
        self.client.force_authenticate(self.employee)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 403)

    def test_admin_can_read_audit_logs(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
