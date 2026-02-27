"""
Central configuration for the GST Reconciliation backend.
All settings are read from environment variables with safe defaults so
the app runs out-of-the-box against a local Neo4j Desktop instance.
Copy .env.example to .env and fill in real values before running.
"""

import os
from dotenv import load_dotenv

# Load .env file if present (development convenience)
load_dotenv()


# ---------------------------------------------------------------------------
# Neo4j
# ---------------------------------------------------------------------------
NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "password")

# Optional: target a named database (leave empty for default)
NEO4J_DATABASE: str = os.getenv("NEO4J_DATABASE", "neo4j")

# ---------------------------------------------------------------------------
# JWT Authentication
# ---------------------------------------------------------------------------
JWT_SECRET: str = os.getenv(
    "JWT_SECRET",
    "gst-recon-super-secret-key-change-in-production"
)
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")  # 8 hours for hackathon
)

# ---------------------------------------------------------------------------
# Admin credentials (single-tenant, hardcoded for hackathon)
# ---------------------------------------------------------------------------
ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin@gst123")

# ---------------------------------------------------------------------------
# Reconciliation thresholds
# ---------------------------------------------------------------------------
# Maximum allowed % difference between GSTR-1 and PR taxable values
VALUE_TOLERANCE_PERCENT: float = float(
    os.getenv("VALUE_TOLERANCE_PERCENT", "2.0")
)

# Grace window (days) for GSTR-3B payment after invoice date
PAYMENT_GRACE_DAYS: int = int(os.getenv("PAYMENT_GRACE_DAYS", "60"))

# Days after which a payment delay is flagged as chronic
CHRONIC_DELAY_DAYS: int = int(os.getenv("CHRONIC_DELAY_DAYS", "45"))

# Min % of risky trading partners to flag vendor network risk
RISKY_PARTNER_THRESHOLD: float = float(
    os.getenv("RISKY_PARTNER_THRESHOLD", "0.30")
)

# Max AMENDS hops before an amendment chain is flagged
AMENDMENT_FLAG_COUNT: int = int(os.getenv("AMENDMENT_FLAG_COUNT", "3"))

# ---------------------------------------------------------------------------
# App metadata
# ---------------------------------------------------------------------------
APP_TITLE: str = "GST Reconciliation Knowledge Graph API"
APP_VERSION: str = "1.0.0"
APP_DESCRIPTION: str = (
    "Graph-based GST reconciliation using multi-hop reasoning, "
    "pattern detection, and explainable ML scoring."
)

# CORS origins allowed to call the API (React dev server)
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
).split(",")
