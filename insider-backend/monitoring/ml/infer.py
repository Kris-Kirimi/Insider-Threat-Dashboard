# monitoring/ml/infer.py
import os
import joblib
import pandas as pd
from django.utils import timezone
from monitoring.models import Anomaly, Alert
from users.models import AuditLog, User
from django.db import transaction

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'iso_forest.joblib')

def load_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(MODEL_PATH)
    data = joblib.load(MODEL_PATH)
    return data['pipeline'], data['feature_cols']

def build_feature_df_for_recent_window(window_minutes=15):
    now = timezone.now()
    start = now - pd.Timedelta(minutes=window_minutes)
    qs = AuditLog.objects.filter(timestamp__gte=start)
    logs = list(qs.values('actor_id', 'action', 'resource_id', 'timestamp'))
    if not logs:
        return pd.DataFrame()
    df = pd.DataFrame(logs)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    # use a per-user aggregate over the window
    action_counts = df.pivot_table(index='actor_id', columns='action', values='resource_id', aggfunc='count', fill_value=0)
    unique_res = df.groupby('actor_id')['resource_id'].nunique().rename('unique_resources')
    agg = action_counts.join(unique_res, how='outer').fillna(0)
    agg['total_actions'] = agg.sum(axis=1)
    agg.reset_index(inplace=True)
    return agg

@transaction.atomic
def infer_and_record(window_minutes=15, threshold=None):
    pipe, feature_cols = load_model()
    df = build_feature_df_for_recent_window(window_minutes=window_minutes)
    if df.empty:
        return []

    # ensure columns present in same order as training
    for c in feature_cols:
        if c not in df.columns:
            df[c] = 0
    X = df[feature_cols].values
    # IsolationForest: decision_function gives anomaly score; lower -> more anomalous (negative)
    scores = pipe.decision_function(X)   # larger is normal, smaller is anomalous
    # convert to positive anomaly score: -score
    anomaly_scores = -scores

    from monitoring.utils import _create_alert

    results = []
    for i, row in df.iterrows():
        user_id = int(row['actor_id'])
        score = float(anomaly_scores[i])
        if threshold is not None:
            is_anom = score >= threshold
        else:
            pred = pipe.named_steps['iso'].predict(X[i].reshape(1, -1))[0]
            is_anom = pred == -1

        results.append({'user_id': user_id, 'score': score, 'is_anomaly': is_anom})

        # Only persist actual anomalies: this runs every minute, so recording
        # every user every window would flood the table with normal behaviour.
        if not is_anom:
            continue

        try:
            user_obj = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            continue

        Anomaly.objects.create(
            actor=user_obj,
            score=score,
            is_anomaly=True,
            reason='isolation_forest_window',
            related_logs=[],
        )

        # Deduplicated alongside the rule-based alerts, so one anomalous user
        # does not raise a new alert every minute.
        _create_alert(
            user_obj, 'ml_anomaly',
            f"ML anomaly score {score:.4f} in last {window_minutes}m",
            'high' if score > 1.0 else 'medium',
        )
    return results
