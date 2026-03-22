#!/bin/bash

# Ensure .env symlinks exist so all packages read from the single root .env
if [ -f .env ]; then
  for pkg in packages/web; do
    if [ ! -e "$pkg/.env" ]; then
      ln -sf ../../.env "$pkg/.env"
      echo "Created .env symlink in $pkg"
    fi
  done
fi

# Check if local PostgreSQL is running
if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  echo "PostgreSQL is running locally"
else
  echo "Starting PostgreSQL via Docker"
  docker compose up -d postgres
fi

# Check if local Redis is running
if redis-cli -h localhost -p 6379 ping >/dev/null 2>&1; then
  echo "Redis is running locally"
else
  echo "Starting Redis via Docker"
  docker compose up -d redis
fi

# Check if local RabbitMQ is running
if rabbitmq-diagnostics check_running >/dev/null 2>&1; then
  echo "RabbitMQ is running locally"
else
  echo "Starting RabbitMQ via Docker"
  docker compose --profile rabbitmq up -d rabbitmq
fi

# Start additional Docker services (exclude workers in dev — they pull in postgres/redis via depends_on)
echo "Starting additional Docker services"
docker compose up -d minio createbuckets mailhog

# OpenSearch is optional for dev — don't fail if it can't start
echo "Starting OpenSearch (optional)..."
docker compose up -d opensearch opensearch-dashboards 2>/dev/null || echo "OpenSearch failed to start — search features will be unavailable"