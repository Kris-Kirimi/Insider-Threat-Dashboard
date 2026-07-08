#!/bin/sh
set -e

# Wait for DB or other services if needed (optional)
# echo "Waiting for postgres..."
# ./wait-for-it.sh db:5432 -t 30

# Apply migrations (non-fatal if already applied)
echo "Running migrations..."
python manage.py migrate --noinput || true

# Collect static (optional)
# python manage.py collectstatic --noinput

# Default behaviour: run provided command, or start gunicorn
if [ "$1" = "celery" ]; then
  # e.g. docker-compose service command: celery worker -A insiderbackend -l info -P solo
  shift
  echo "Starting celery with args: $@"
  exec celery "$@"
elif [ "$1" = "celery-beat" ]; then
  shift
  echo "Starting celery beat with args: $@"
  exec celery beat "$@"
elif [ "$1" = "flower" ]; then
  shift
  echo "Starting flower with args: $@"
  exec celery flower "$@"
elif [ "$1" = "web" ]; then
  shift
  echo "Starting web with args: $@"
  exec gunicorn insiderbackend.wsgi:application --bind 0.0.0.0:8000 --workers 3 "$@"
else
  # If command provided, just run it
  if [ $# -gt 0 ]; then
    echo "Running command: $@"
    exec "$@"
  fi

  # fallback
  echo "No command provided - starting gunicorn"
  exec gunicorn insiderbackend.wsgi:application --bind 0.0.0.0:8000 --workers 3
fi

