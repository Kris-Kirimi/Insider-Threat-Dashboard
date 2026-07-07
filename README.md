# Insider Threat Dashboard

AI-powered insider threat detection and monitoring system.

Unlike traditional security tooling that focuses on external attackers, this
platform continuously monitors **authenticated users** after login. It combines
rule-based threat detection, machine-learning anomaly detection, audit logging
and alert management to surface malicious, negligent or compromised insider
activity.

## Architecture

```
                +------------------+
                | Next.js Frontend |
                +--------+---------+
                         |
                     REST API
                         |
               Django REST Backend
                         |
        +----------------+----------------+
        |                |                |
 Authentication    File Management    Monitoring Engine
        |                |                |
        +-------+--------+----------------+
                |
          Audit Logging
                |
         Detection Engine (Celery, every 60s)
                |
    +-----------+-------------+
    |                         |
 Rule-Based              Machine Learning
 Detection               (Isolation Forest)
    |                         |
    +-----------+-------------+
                |
             Alerts
                |
        Risk Dashboard
```

## Technology stack

| Component        | Technology                          |
| ---------------- | ----------------------------------- |
| Backend API      | Django 5 + Django REST Framework    |
| Frontend         | Next.js 15 (React 19, MUI)          |
| Database         | PostgreSQL (or SQLite for dev)      |
| Background tasks | Celery + Celery Beat                |
| Message broker   | Redis                               |
| Realtime         | Django Channels (WebSockets)        |
| Authentication   | JWT (SimpleJWT) + email OTP         |
| Machine learning | scikit-learn (Isolation Forest)     |
| Task monitoring  | Flower                              |
| Deployment       | Docker Compose                      |

## How it works

1. **Authentication** — users sign in with email + password, then confirm a
   6-digit OTP sent by email. Successful verification issues JWT access and
   refresh tokens. Failed OTP attempts are rate-limited and audited.
2. **Audit logging** — every significant action (`login`, `logout`,
   `otp_sent`, `otp_failed`, `download_resource`, `delete_resource`,
   `unauthorized_access`, …) creates an `AuditLog` row with actor, resource,
   IP address and metadata.
3. **Detection engine** — a Celery Beat task runs every 60 seconds and scans
   the recent audit-log window:

   | Detector             | Rule                                        | Severity |
   | -------------------- | ------------------------------------------- | -------- |
   | OTP brute force      | >5 failed OTP attempts in 15 min            | High     |
   | Rapid logins         | >5 logins in 10 min                         | Medium   |
   | Unusual hours        | Login between 00:00 and 06:00 local time    | Medium   |
   | Excessive downloads  | >5 downloads in 5 min                       | High     |
   | Unauthorized access  | Permission layer denied a resource action   | High     |
   | Suspicious sequence  | login → delete → logout within 10 min       | High     |

4. **ML anomaly detection** — an Isolation Forest trained on per-user activity
   features (login/download/delete/failure counts) scores recent behaviour;
   anomalies raise alerts alongside the rule-based ones.
5. **Dashboard** — administrators see active alerts, alert history, audit
   logs, user activity and severity distribution in the Next.js dashboard.

## Project layout

```
insider-backend/            Django project
  insiderbackend/           settings, urls, celery app
  users/                    custom user model, auth/OTP, resources, RBAC, audit log
  monitoring/               alerts, detection engine, ML training/inference
  files/, accesscontrol/    sample-file storage and per-user resource access models
insider-threat-dashboard/   Next.js frontend
```

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 20+
- Redis (local install, or `docker compose up redis`)

### Backend

```bash
cd insider-backend
python -m venv venv
venv\Scripts\activate          # Windows (source venv/bin/activate on Unix)
pip install -r requirements.txt

# configure environment
copy .env.example .env         # then edit .env (at minimum set SECRET_KEY)

python manage.py migrate
python manage.py seed_initial  # optional: seed departments/roles/admin
python manage.py runserver
```

By default (no `EMAIL_BACKEND` configured) OTP codes are printed to the
runserver console, so you can log in without a working SMTP account.

### Background workers

```bash
celery -A insiderbackend worker -l info -P solo   # -P solo on Windows
celery -A insiderbackend beat -l info
```

Or run everything (web, Redis, worker, beat, Flower) with Docker:

```bash
cd insider-backend
docker compose up --build
```

### Frontend

```bash
cd insider-threat-dashboard
npm install
npm run dev
```

The frontend expects the API at `http://127.0.0.1:8000` by default; override
with `NEXT_PUBLIC_API_BASE` in `insider-threat-dashboard/.env.local`.

### ML model (optional)

Train the Isolation Forest from accumulated audit logs; inference runs
automatically inside the detection task once the model file exists:

```bash
python manage.py train_ml_model --days 30
```

## Environment variables

See [insider-backend/.env.example](insider-backend/.env.example). Secrets are
never committed: `.env`, the SQLite database and ML model artifacts are all
git-ignored.

| Variable              | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `SECRET_KEY`          | Django secret key (required)                     |
| `DEBUG`               | `True`/`False`                                   |
| `ALLOWED_HOSTS`       | Comma-separated hostnames                        |
| `FRONTEND_ORIGINS`    | Comma-separated origins for CORS/CSRF            |
| `DATABASE_URL`        | Postgres URL; empty → local SQLite               |
| `EMAIL_*`             | SMTP settings for OTP delivery                   |
| `REDIS_URL`           | Broker/result/channel-layer Redis URL            |

## Security features

- JWT authentication with email OTP second factor
- OTP rate limiting and single-use enforcement
- Role- and department-based access control on resources
- Comprehensive audit logging with IP addresses
- Continuous rule-based and ML-based threat detection
- Secrets managed via environment variables
