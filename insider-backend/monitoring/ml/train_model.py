# monitoring/ml/train_model.py
import os
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from django.utils import timezone
from users.models import AuditLog  # ensure import path correct

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = MODEL_DIR / "iso_forest.joblib"

def extract_features_from_queryset(qs):
    # accepts a QuerySet or list/dict; returns DataFrame
    if qs is None:
        return pd.DataFrame()
    if hasattr(qs, 'values'):
        logs = list(qs.values('actor_id', 'action', 'resource_id', 'timestamp'))
    else:
        logs = list(qs)
    if not logs:
        return pd.DataFrame()
    df = pd.DataFrame(logs)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df['date'] = df['timestamp'].dt.floor('D')
    action_counts = df.pivot_table(index=['actor_id','date'],
                                   columns='action',
                                   values='resource_id',
                                   aggfunc='count',
                                   fill_value=0)
    unique_res = df.groupby(['actor_id','date'])['resource_id'].nunique().rename('unique_resources')
    agg = action_counts.join(unique_res, how='left').fillna(0)
    agg.reset_index(inplace=True)
    agg['total_actions'] = agg.select_dtypes('number').sum(axis=1)
    return agg

def train_and_save(qs=None, contamination=0.01, random_state=42):
    """
    If qs is None, train on the last 30 days of AuditLog entries.
    Saves model to monitoring/ml/models/iso_forest.joblib
    """
    if qs is None:
        period_start = timezone.now() - pd.Timedelta(days=30)
        qs = AuditLog.objects.filter(timestamp__gte=period_start)

    Xdf = extract_features_from_queryset(qs)
    if Xdf.empty:
        raise ValueError("No training data available for the given queryset/window")

    feature_cols = [c for c in Xdf.columns if c not in ('actor_id','date')]
    X = Xdf[feature_cols].values

    pipe = Pipeline([
        ('scaler', StandardScaler()),
        ('iso', IsolationForest(n_estimators=200, contamination=contamination, random_state=random_state, n_jobs=-1))
    ])

    pipe.fit(X)

    joblib.dump({'pipeline': pipe, 'feature_cols': feature_cols}, str(MODEL_PATH))
    return str(MODEL_PATH)
