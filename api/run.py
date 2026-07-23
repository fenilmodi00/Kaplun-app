"""Uvicorn launcher for the FastAPI backend."""
import sys
from pathlib import Path

# Ensure project root is in sys.path so `api.main` is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
