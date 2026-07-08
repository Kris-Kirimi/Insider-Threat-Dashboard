"""
Django settings for insiderbackend project.

All secrets and machine-specific values are read from environment
variables (loaded from insider-backend/.env, which is NOT committed).
See .env.example for the expected variables.
"""
import os
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

# ---------------------------------------------------------------------------
# Core security settings
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError(
        'SECRET_KEY is not set. Copy .env.example to .env and fill it in.'
    )

DEBUG = os.getenv('DEBUG', 'False').lower() in ('1', 'true', 'yes')

ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]

# ---------------------------------------------------------------------------
# Database: DATABASE_URL if provided, otherwise local SQLite for development
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv('DATABASE_URL')
TESTING = 'test' in sys.argv
if TESTING:
    # Tests always run on a local in-memory SQLite DB, never the real database.
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
elif DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=600,
            ssl_require=True,
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'channels',
    'django_celery_beat',
    # project apps
    'users',
    'files',
    'accesscontrol',
    'monitoring.apps.MonitoringConfig',
]

AUTH_USER_MODEL = 'users.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'insiderbackend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'insiderbackend.wsgi.application'
ASGI_APPLICATION = 'insiderbackend.asgi.application'

# ---------------------------------------------------------------------------
# REST framework / JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=3),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

SESSION_COOKIE_AGE = 60 * 60 * 3  # 3 hours
SESSION_SAVE_EVERY_REQUEST = True

# ---------------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------------
FRONTEND_ORIGINS = [
    o.strip()
    for o in os.getenv('FRONTEND_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',')
    if o.strip()
]

CORS_ALLOWED_ORIGINS = FRONTEND_ORIGINS
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

CSRF_TRUSTED_ORIGINS = FRONTEND_ORIGINS

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.getenv('TIME_ZONE', 'Africa/Nairobi')
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static & media files
# ---------------------------------------------------------------------------
STATIC_URL = 'static/'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Email (OTP delivery)
# ---------------------------------------------------------------------------
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER or 'noreply@insiderdash.local'

# ---------------------------------------------------------------------------
# Celery / Redis
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', REDIS_URL)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'

from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    'run-detections-every-minute': {
        'task': 'monitoring.run_all_detections',
        'schedule': 60.0,
    },
    'retrain-ml-model-weekly': {
        'task': 'monitoring.train_ml_model',
        'schedule': crontab(day_of_week='sun', hour=2, minute=0),
    },
    'cleanup-old-data-nightly': {
        'task': 'monitoring.cleanup_old_data',
        'schedule': crontab(hour=3, minute=0),
    },
}

# ---------------------------------------------------------------------------
# Channels (websocket alerts)
# ---------------------------------------------------------------------------
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [REDIS_URL],
        },
    },
}
