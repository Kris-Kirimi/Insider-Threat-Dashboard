"""End-to-end detection tests: every detector must fire from real API traffic.

The existing unit tests in monitoring/tests.py build AuditLog rows directly.
That is what let a genuinely dead detector look healthy -- detect_failed_otp_bruteforce
needed more failures than the login view was capable of recording, and no test
noticed because no test went through the view. These drive the HTTP API.
"""
import tempfile
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from users.models import OTP, AccessControl, AuditLog, Department, Resource, Role, User

from .models import Alert
from .utils import run_all_detections

PASSWORD = 'S3curePass!'
MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class DetectionE2ETests(APITestCase):

    def setUp(self):
        self.finance = Department.objects.create(name='Finance')
        self.it = Department.objects.create(name='IT')
        self.role = Role.objects.create(name='Employee', department=self.finance, level=1)

        self.user = User.objects.create_user(
            email='suspect@example.com', password=PASSWORD, full_name='Suspect',
            department=self.finance, role=self.role)

        self.own_doc = Resource.objects.create(
            name='mine.txt',
            path=default_storage.save('resources/mine.txt', ContentFile(b'data')),
            department=self.finance, created_by=self.user)
        self.other_doc = Resource.objects.create(
            name='theirs.txt',
            path=default_storage.save('resources/theirs.txt', ContentFile(b'data')),
            department=self.it)

    # -- helpers ---------------------------------------------------------
    def _login_once(self):
        """A full password -> OTP -> token round trip."""
        self.client.post(reverse('login_send_otp'),
                         {'email': self.user.email, 'password': PASSWORD}, format='json')
        otp = OTP.objects.filter(user=self.user).latest('created_at')
        return self.client.post(reverse('verify_otp'),
                                {'email': self.user.email, 'otp': otp.code}, format='json')

    def _alert(self, action):
        return Alert.objects.filter(user=self.user, action=action).first()

    # -- detectors -------------------------------------------------------
    def test_otp_bruteforce_fires_at_the_lockout_boundary(self):
        """Regression for the off-by-one that made this detector unreachable.

        The view used to return 429 without logging, capping otp_failed at the
        lockout threshold -- exactly the number the detector had to exceed.
        """
        self.client.post(reverse('login_send_otp'),
                         {'email': self.user.email, 'password': PASSWORD}, format='json')

        threshold = 5  # settings.DETECTION OTP_LOCKOUT_THRESHOLD default
        for _ in range(threshold):
            res = self.client.post(reverse('verify_otp'),
                                   {'email': self.user.email, 'otp': '000000'}, format='json')
            self.assertEqual(res.status_code, 400)

        locked = self.client.post(reverse('verify_otp'),
                                  {'email': self.user.email, 'otp': '000000'}, format='json')
        self.assertEqual(locked.status_code, 429, 'lockout should engage')

        self.assertGreater(
            AuditLog.objects.filter(actor=self.user, action='otp_failed').count(), threshold,
            'the blocked attempt must be logged, or the detector can never fire')

        run_all_detections()
        alert = self._alert('otp_failed')
        self.assertIsNotNone(alert, 'OTP brute force went undetected')
        self.assertEqual(alert.severity, 'high')
        self.assertTrue(alert.related_logs)

    def test_failed_password_logins_lock_out_and_alert(self):
        """The login equivalent of the OTP brute-force test.

        Also pins that the blocked attempt is logged: without it the failure
        count would stop at the lockout threshold, which is the same number
        the detector must exceed, so the alert could never fire.
        """
        threshold = 5  # DETECTION['LOGIN_LOCKOUT_THRESHOLD'] default
        for _ in range(threshold):
            res = self.client.post(reverse('login_send_otp'),
                                   {'email': self.user.email, 'password': 'wrong'},
                                   format='json')
            self.assertEqual(res.status_code, 400)

        locked = self.client.post(reverse('login_send_otp'),
                                  {'email': self.user.email, 'password': 'wrong'},
                                  format='json')
        self.assertEqual(locked.status_code, 429, 'lockout should engage')

        self.assertGreater(
            AuditLog.objects.filter(actor=self.user, action='login_failed').count(), threshold,
            'the blocked attempt must be logged or the detector can never fire')

        run_all_detections()
        alert = self._alert('login_failed')
        self.assertIsNotNone(alert, 'failed logins went undetected')
        self.assertEqual(alert.severity, 'high')
        self.assertTrue(alert.related_logs)

    def test_correct_password_still_works_below_the_lockout(self):
        for _ in range(3):
            self.client.post(reverse('login_send_otp'),
                             {'email': self.user.email, 'password': 'wrong'}, format='json')
        res = self.client.post(reverse('login_send_otp'),
                               {'email': self.user.email, 'password': PASSWORD}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_unknown_email_attempts_are_recorded_and_rate_limited(self):
        """Address enumeration used to leave no trace whatsoever."""
        for _ in range(5):
            res = self.client.post(reverse('login_send_otp'),
                                   {'email': 'ghost@example.com', 'password': 'wrong'},
                                   format='json')
            self.assertEqual(res.status_code, 400)

        blocked = self.client.post(reverse('login_send_otp'),
                                   {'email': 'ghost@example.com', 'password': 'wrong'},
                                   format='json')
        self.assertEqual(blocked.status_code, 429)

        rows = AuditLog.objects.filter(action='login_failed', actor__isnull=True)
        self.assertGreater(rows.count(), 5)
        self.assertEqual(rows.first().metadata['email'], 'ghost@example.com')

    def test_rapid_logins_detected(self):
        for _ in range(6):
            self.assertEqual(self._login_once().status_code, 200)

        run_all_detections()
        self.assertIsNotNone(self._alert('rapid_login'))

    def test_excessive_downloads_detected(self):
        self.client.force_authenticate(self.user)
        url = reverse('download_resource', args=[self.own_doc.pk])
        for _ in range(6):
            self.assertEqual(self.client.get(url).status_code, 200)

        run_all_detections()
        alert = self._alert('excessive_downloads')
        self.assertIsNotNone(alert)
        self.assertEqual(len(alert.related_logs), 6)

    def test_unauthorized_access_detected_via_exception_handler(self):
        """No view logs this denial -- the audited exception handler must."""
        self.client.force_authenticate(self.user)
        res = self.client.get(f'/api/resources/{self.other_doc.pk}/')
        self.assertEqual(res.status_code, 403)

        run_all_detections()
        alert = self._alert('unauthorized_access')
        self.assertIsNotNone(alert, 'denial was not recorded by the exception handler')
        self.assertEqual(alert.severity, 'high')

    def test_suspicious_sequence_detected(self):
        self._login_once()
        self.client.force_authenticate(self.user)
        self.client.delete(f'/api/resources/{self.own_doc.pk}/')
        self.client.post(reverse('logout'))

        run_all_detections()
        alert = self._alert('suspicious_sequence')
        self.assertIsNotNone(alert)
        self.assertEqual(len(alert.related_logs), 3)

    def test_unusual_hours_login_detected(self):
        """A login inside the configured out-of-hours band is flagged.

        The band is shifted onto the current hour rather than back-dating the
        login to 02:00, because the detector only scans a recent window: in
        production the 60-second Beat cycle is itself running at 02:00, but a
        test run at midday would place a 02:00 row hours outside that window.
        Moving the band keeps both halves of the rule under test.
        """
        self._login_once()
        current_hour = timezone.localtime(timezone.now()).hour
        band = {
            **settings.DETECTION,
            'UNUSUAL_HOUR_START': current_hour,
            'UNUSUAL_HOUR_END': current_hour + 1,
        }

        with override_settings(DETECTION=band):
            run_all_detections()

        alert = self._alert('unusual_login_hour')
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, 'medium')

    def test_daytime_login_is_not_flagged_as_unusual(self):
        """The complement: a login outside the band must stay quiet."""
        self._login_once()
        current_hour = timezone.localtime(timezone.now()).hour
        # A one-hour band that deliberately excludes the current hour.
        elsewhere = (current_hour + 3) % 24
        band = {
            **settings.DETECTION,
            'UNUSUAL_HOUR_START': elsewhere,
            'UNUSUAL_HOUR_END': elsewhere + 1,
        }

        with override_settings(DETECTION=band):
            run_all_detections()

        self.assertIsNone(self._alert('unusual_login_hour'))

    def test_multiple_detections_escalate_to_critical(self):
        self.client.force_authenticate(self.user)
        for _ in range(6):
            self.client.get(reverse('download_resource', args=[self.own_doc.pk]))
        self.client.get(f'/api/resources/{self.other_doc.pk}/')
        self.client.delete(f'/api/resources/{self.other_doc.pk}/')

        self._login_once()
        self.client.force_authenticate(self.user)
        self.client.delete(f'/api/resources/{self.own_doc.pk}/')
        self.client.post(reverse('logout'))

        run_all_detections()
        alert = self._alert('correlated_threat')
        self.assertIsNotNone(alert, 'three distinct detections should escalate')
        self.assertEqual(alert.severity, 'critical')

    def test_thresholds_are_read_from_settings_at_call_time(self):
        """Detectors must consult settings per call, not bind defaults at import."""
        self.client.force_authenticate(self.user)
        for _ in range(3):
            self.client.get(reverse('download_resource', args=[self.own_doc.pk]))

        run_all_detections()
        self.assertIsNone(self._alert('excessive_downloads'),
                          '3 downloads is below the default threshold')

        lowered = {**settings.DETECTION, 'DOWNLOAD_THRESHOLD': 2}
        with override_settings(DETECTION=lowered):
            run_all_detections()

        self.assertIsNotNone(self._alert('excessive_downloads'),
                             'lowered threshold from settings was not honoured')


class AlertDedupTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email='dedup@example.com', password=PASSWORD, full_name='Dedup')

    def _downloads(self, n):
        for _ in range(n):
            AuditLog.objects.create(actor=self.user, action='download_resource')

    def test_same_evidence_does_not_alert_twice(self):
        self._downloads(6)
        run_all_detections()
        run_all_detections()
        self.assertEqual(
            Alert.objects.filter(user=self.user, action='excessive_downloads').count(), 1)

    def test_new_evidence_alerts_again_after_triage(self):
        """Resolving an alert must not mute genuinely new activity."""
        self._downloads(6)
        run_all_detections()
        alert = Alert.objects.get(user=self.user, action='excessive_downloads')
        alert.status = 'resolved'
        alert.save(update_fields=['status'])

        self._downloads(1)
        run_all_detections()
        self.assertEqual(
            Alert.objects.filter(user=self.user, action='excessive_downloads').count(), 2)
