# Use an official Python runtime as a parent image
FROM python:3.11-slim

# avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# system deps for psycopg2 / cryptography / pillow (PostgreSQL stack)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     build-essential \
     gcc \
     pkg-config \
     libpq-dev \
     libffi-dev \
     libssl-dev \
     curl \
  && rm -rf /var/lib/apt/lists/*

# create app user and workdir
RUN useradd -m insiderAdmin
WORKDIR /insider-backend

# copy requirements and install
COPY requirements.txt /insider-backend/

RUN pip install --upgrade pip setuptools wheel \
  && pip install --no-cache-dir -r /insider-backend/requirements.txt

# copy project
COPY . /insider-backend/

# make entrypoint executable; strip any CR so the shebang execs on Linux even
# if the file was checked out with Windows (CRLF) line endings.
COPY entrypoint.sh /insider-backend/entrypoint.sh
RUN sed -i 's/\r$//' /insider-backend/entrypoint.sh \
  && chmod +x /insider-backend/entrypoint.sh

# switch to non-root user (optional but recommended)
USER insiderAdmin

EXPOSE 8000

ENTRYPOINT ["/insider-backend/entrypoint.sh"]