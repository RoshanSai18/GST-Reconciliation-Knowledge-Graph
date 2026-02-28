"""
GST Reconciliation Knowledge Graph — FastAPI application entry point.

Startup sequence
----------------
1. Verify Neo4j connectivity (warns but does NOT crash if DB is warming up).
2. Run schema_init to create constraints and indexes (idempotent).
3. Register all API routers with their URL prefixes.

Run locally
-----------
    uvicorn main:app --reload --port 8000

Interactive API docs
--------------------
    http://localhost:8000/docs      (Swagger UI)
    http://localhost:8000/redoc     (ReDoc)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from database.neo4j_client import close_driver, verify_connectivity
from database.schema_init import init_schema

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated @app.on_event)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown logic."""
    # ── Startup ──────────────────────────────────────────────────────────
    logger.info("═══════════════════════════════════════════════")
    logger.info(" GST Reconciliation API — starting up")
    logger.info("═══════════════════════════════════════════════")

    connected = verify_connectivity()
    if connected:
        init_schema()
    else:
        logger.warning(
            "Neo4j is not reachable at %s — schema init skipped. "
            "Ensure Neo4j Desktop is running and retry.",
            config.NEO4J_URI,
        )

    yield  # Application runs here

    # ── Shutdown ─────────────────────────────────────────────────────────
    logger.info("GST Reconciliation API — shutting down.")
    close_driver()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title=config.APP_TITLE,
    version=config.APP_VERSION,
    description=config.APP_DESCRIPTION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers  (imported lazily so missing router files don't break startup)
# Each router is registered only when its module exists.
# As phases are completed, remove the try/except and keep the direct import.
# ---------------------------------------------------------------------------
def _register_router(module_path: str, prefix: str, tags: list[str]) -> None:
    try:
        import importlib
        mod = importlib.import_module(module_path)
        app.include_router(mod.router, prefix=prefix, tags=tags)
        logger.info("Router registered: %s → %s", module_path, prefix)
    except ModuleNotFoundError:
        logger.debug("Router not yet implemented, skipping: %s", module_path)


_register_router("routers.auth",      "/api/auth",      ["Authentication"])
_register_router("routers.upload",    "/api/upload",    ["Data Ingestion"])
_register_router("routers.reconcile", "/api/reconcile", ["Reconciliation"])
_register_router("routers.invoices",  "/api/invoices",  ["Invoices"])
_register_router("routers.vendors",   "/api/vendors",   ["Vendors"])
_register_router("routers.patterns",  "/api/patterns",  ["Pattern Detection"])
_register_router("routers.graph",     "/api/graph",     ["Graph Export"])
_register_router("routers.chat",      "/api/chat",      ["Chat"])
_register_router("routers.whatsapp",  "/api/whatsapp",  ["WhatsApp"])


# ---------------------------------------------------------------------------
# Root health-check endpoint
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    """Health check — confirms the API is running."""
    return {
        "status": "ok",
        "app": config.APP_TITLE,
        "version": config.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    """Detailed health check including Neo4j connectivity."""
    neo4j_ok = verify_connectivity()
    return {
        "api": "ok",
        "neo4j": "connected" if neo4j_ok else "unreachable",
        "neo4j_uri": config.NEO4J_URI,
    }
