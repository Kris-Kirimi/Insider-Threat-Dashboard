from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from users.models import AuditLog, User
from .models import Alert, Anomaly
from .risk import compute_risk_scores, risk_level
from .tasks import cleanup_old_data_task
from .utils import escalate_correlated_alerts, run_all_detections


def make_user(email='bob@example.com'):
    return User.objects.create_user(email=email, password='S3curePass!', full_name='Bob')


class DetectionEngineTests(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_otp_bruteforce_creates_high_alert_with_evidence(self):
        for _ in range(6):
            AuditLog.objects.create(actor=self.user, action='otp_failed')
        run_all_detections()
        alert = Alert.objects.get(user=self.user, action='otp_failed')
        self.assertEqual(alert.severity, 'high')
        self.assertEqual(alert.status, 'new')
        self.assertEqual(len(alert.related_logs), 6)

    def test_alerts_are_deduplicated_within_window(self):
        for _ in range(6):
            AuditLog.objects.create(actor=self.user, action='otp_failed')
        run_all_detections()
        run_all_detections()
        self.assertEqual(Alert.objects.filter(user=self.user, action='otp_failed').count(), 1)

    def test_excessive_downloads_detected(self):
        for _ in range(6):
            AuditLog.objects.create(actor=self.user, action='download_resource')
        run_all_detections()
        self.assertTrue(Alert.objects.filter(user=self.user, action='excessive_downloads').exists())

    def test_unauthorized_access_detected(self):
        AuditLog.objects.create(actor=self.user, action='unauthorized_access')
        run_all_detections()
        self.assertTrue(Alert.objects.filter(user=self.user, action='unauthorized_access').exists())

    def test_suspicious_sequence_detected(self):
        for action in ('login', 'delete_resource', 'logout'):
            AuditLog.objects.create(actor=self.user, action=action)
        run_all_detections()
        alert = Alert.objects.get(user=self.user, action='suspicious_sequence')
        self.assertEqual(alert.severity, 'high')
        self.assertEqual(len(alert.related_logs), 3)

    def test_correlated_alerts_escalate_to_critical(self):
        for action in ('rapid_login', 'excessive_downloads', 'unusual_login_hour'):
            Alert.objects.create(user=self.user, action=action,
                                 description='x', severity='medium')
        escalate_correlated_alerts()
        critical = Alert.objects.get(user=self.user, action='correlated_threat')
        self.assertEqual(critical.severity, 'critical')

    def test_no_escalation_below_threshold(self):
        for action in ('rapid_login', 'excessive_downloads'):
            Alert.objects.create(user=self.user, action=action,
                                 description='x', severity='medium')
        escalate_correlated_alerts()
        self.assertFalse(Alert.objects.filter(action='correlated_threat').exists())


class RiskScoreTests(TestCase):
    def setUp(self):
        self.quiet = make_user('quiet@example.com')
        self.noisy = make_user('noisy@example.com')

    def test_severity_weighting_orders_users(self):
        Alert.objects.create(user=self.quiet, action='rapid_login',
                             description='x', severity='low')
        Alert.objects.create(user=self.noisy, action='correlated_threat',
                             description='x', severity='critical')
        scores = compute_risk_scores()
        self.assertEqual(scores[0]['email'], 'noisy@example.com')
        self.assertGreater(scores[0]['score'], scores[1]['score'])

    def test_false_positives_are_excluded(self):
        Alert.objects.create(user=self.quiet, action='rapid_login',
                             description='x', severity='high', status='false_positive')
        self.assertEqual(compute_risk_scores(), [])

    def test_risk_levels(self):
        self.assertEqual(risk_level(20), 'critical')
        self.assertEqual(risk_level(8), 'high')
        self.assertEqual(risk_level(4), 'elevated')
        self.assertEqual(risk_level(1), 'low')


class RetentionTests(TestCase):
    def test_cleanup_removes_only_stale_rows(self):
        user = make_user()
        old = timezone.now() - timedelta(days=120)

        fresh_log = AuditLog.objects.create(actor=user, action='login')
        stale_log = AuditLog.objects.create(actor=user, action='login')
        AuditLog.objects.filter(pk=stale_log.pk).update(timestamp=old)

        open_alert = Alert.objects.create(user=user, action='a', description='x')
        closed_stale = Alert.objects.create(user=user, action='b', description='x',
                                            status='resolved', cleared=True)
        Alert.objects.filter(pk=closed_stale.pk).update(timestamp=old)
        # An OLD but still-open alert must be kept.
        open_stale = Alert.objects.create(user=user, action='c', description='x')
        Alert.objects.filter(pk=open_stale.pk).update(timestamp=old)

        stale_anomaly = Anomaly.objects.create(actor=user, score=1.0, is_anomaly=True)
        Anomaly.objects.filter(pk=stale_anomaly.pk).update(created_at=old)

        cleanup_old_data_task()

        self.assertTrue(AuditLog.objects.filter(pk=fresh_log.pk).exists())
        self.assertFalse(AuditLog.objects.filter(pk=stale_log.pk).exists())
        self.assertTrue(Alert.objects.filter(pk=open_alert.pk).exists())
        self.assertTrue(Alert.objects.filter(pk=open_stale.pk).exists())
        self.assertFalse(Alert.objects.filter(pk=closed_stale.pk).exists())
        self.assertFalse(Anomaly.objects.filter(pk=stale_anomaly.pk).exists())
