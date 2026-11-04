import os
import tempfile

# one throw-away database + upload folder for the whole test session
os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}")
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp())

os.environ.setdefault("GEO_INDEX", "0")  # no network downloads in tests
