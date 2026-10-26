#!/usr/bin/env bash
set -e
if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
  echo "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum di-set."
  exit 1
fi
if [ -z "$SECRET_KEY" ]; then
  export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
fi
export ALLOW_DEMO_LOGIN=false
python app.py
