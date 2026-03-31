from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
import logging
from pathlib import Path
from datetime import datetime

from database import client
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.cards import router as cards_router
from routes.tags import router as tags_router
from routes.stats import router as stats_router
from utils import UPLOADS_DIR

app = FastAPI(title="PokéCollection API", version="2.0")

# API Routes - all prefixed with /api
from fastapi import APIRouter
api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(cards_router)
api_router.include_router(tags_router)
api_router.include_router(stats_router)

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

app.include_router(api_router)

# Static files for uploaded images
app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# CORS
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
