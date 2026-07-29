import base64
import os
import sys
from pathlib import Path

# Repo root on sys.path so `import api.xxx` works when pytest runs from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Env defaults BEFORE any api module import (modules read env at import time).
os.environ.setdefault("TOKEN_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"k" * 32).decode())
os.environ.setdefault("WEBHOOK_VERIFY_TOKEN", "test-verify-token")
os.environ.setdefault("INSTAGRAM_APP_SECRET", "test-ig-secret")
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-fb-secret")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("PUBLIC_BASE_URL", "https://api.example.com")
# Automation store talks to Appwrite; these prevent accidental production use in tests.
os.environ.setdefault("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
os.environ.setdefault("APPWRITE_PROJECT_ID", "test-project")
os.environ.setdefault("APPWRITE_API_KEY", "test-api-key")
os.environ.setdefault("APPWRITE_DATABASE_ID", "test-db")
# Disable the sweeper during TestClient tests (lifespan is never started anyway,
# but this guards any future test that imports the app at module scope).
os.environ.setdefault("AUTOMATION_SWEEPER_ENABLED", "false")
