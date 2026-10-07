import os
import sys
from pathlib import Path

# Add backend directory to sys.path so app can be imported
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    port = int(
        os.environ.get(
            "PORT",
            settings.PORT or os.environ.get("BACKEND_PORT", settings.BACKEND_PORT),
        )
    )
    host = os.environ.get("BACKEND_HOST", settings.BACKEND_HOST)
    print(f"Starting Deal Desk Quote Simulator API on {host}:{port}")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
