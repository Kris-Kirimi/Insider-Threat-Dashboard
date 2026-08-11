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

   When one user trips three or more distinct detections within an hour, the
   engine raises a single **critical** correlated-threat alert instead of
   several isolated ones.
4. **ML anomaly detection** — an Isolation Forest trained on per-user activity
   features (login/download/delete/failure counts) scores recent behaviour;
   anomalies raise alerts alongside the rule-based ones (deduplicated and
   retrained weekly).
5. **Risk scoring** — each user gets a rolling 30-day, time-decayed risk score
   weighted by alert severity, surfaced as the dashboard's "highest-risk users"
   panel (`/api/monitoring/risk-scores/`).
6. **Alert triage** — every alert carries a status
   (new → acknowledged → investigating → resolved / false positive) and links
   to the audit-log rows that triggered it, so an admin can click through to the
   evidence during an investigation.
7. **Dashboard** — administrators see active alerts with triage controls,
   evidence, audit logs, risk scores and severity distribution in the Next.js
   dashboard, updated in real time over WebSockets.
8. **Retention** — a nightly task prunes audit logs older than 90 days, stale
   anomalies and long-closed alerts so the tables stay bounded.

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
python manage.py seed_initial     # required: departments + roles with levels
python manage.py createsuperuser  # your admin account
python manage.py runserver
```

`seed_initial` is not optional. Role levels (System Admin=4, Manager=3,
Analyst=2, Employee=1) are what the permission layer compares against, so
without them the manager-grade checks can never pass. Add `--demo` for sample
employees, files and an example access revocation:

```bash
python manage.py seed_initial --demo
```

By default (no `EMAIL_BACKEND` configured) OTP codes are printed to the
runserver console, so you can log in without a working SMTP account.

### Demonstrating detection

Some detectors need activity that is tedious to produce by hand (six logins in
ten minutes means six emailed OTP round trips). `simulate_threat` writes the
same audit events those flows would, timed to land inside each detector's
window:

```bash
python manage.py simulate_threat --user finance.employee@insider.local --scenario all --run-detections
```

Scenarios: `otp_bruteforce`, `rapid_login`, `unusual_hours`, `exfiltration`,
`unauthorized`, `sequence`, or `all`. Add `--dry-run` to preview. It refuses to
run with `DEBUG=False` unless you pass `--force`.

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

## Authorization model

Two distinct kinds of authority, deliberately kept separate:

| Notion | Field | Governs |
| ------ | ----- | ------- |
| Administrator | `User.is_staff` | The `/dashboard` console and its APIs: audit logs, alerts, risk scores, account creation and deletion |
| Privilege within a department | `Role.level` (1–4) | What you may do to your own department's resources. Write and delete need level ≥ 3 (Manager) |

Resource access is decided by `RoleEnforcer` (`users/permissions.py`), most
specific rule first. An explicit ACL entry is **authoritative** — a grant of
`none` revokes access rather than falling through to a broader rule:

1. Administrator → allowed
2. Explicit per-user `AccessControl` → decides outright
3. Explicit per-role `ResourceAccess` → decides outright
4. Resource owner → allowed
5. Same department → everyone reads; only level ≥ 3 writes or deletes
6. Otherwise → denied

Because DRF never runs object permissions on list endpoints, collection
queries are additionally narrowed by `scope_resources_for()`
(`users/scoping.py`) so employees cannot enumerate other departments' files.

**Every denial is evidence.** A custom DRF exception handler
(`users/exception_handlers.py`) records each 403 as an `unauthorized_access`
audit row, which is exactly what `detect_unauthorized_access` consumes — so
attempts to reach forbidden data become alerts rather than silent refusals.

Tokens are only ever minted by `/api/auth/verify-otp/`; there is deliberately
no password-grant endpoint, so the OTP second factor cannot be skipped.

Regression tests for all of the above live in `users/tests_access.py` and
`monitoring/tests_detection_e2e.py`:

```bash
python manage.py test
```
