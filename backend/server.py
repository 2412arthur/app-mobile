from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'pokemon_cards_db')]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Admin password - in production use env variable
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'pokemon2025')

# Define Models
class CardBase(BaseModel):
    name: str
    image: Optional[str] = None  # Base64 image
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    condition: str = "Good"  # Mint, Near Mint, Excellent, Good, Poor
    tags: List[str] = []
    notes: Optional[str] = None
    deadline: Optional[str] = None  # ISO date string

class CardCreate(CardBase):
    pass

class CardUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    condition: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    deadline: Optional[str] = None

class MarkFoundRequest(BaseModel):
    found_by: str

class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#3B82F6"  # Default blue

class AuthRequest(BaseModel):
    password: str

class AuthResponse(BaseModel):
    is_admin: bool
    message: str

# Helper to convert MongoDB document to dict
def card_to_dict(card: dict) -> dict:
    if '_id' in card:
        card['id'] = str(card['_id'])
        del card['_id']
    return card

def tag_to_dict(tag: dict) -> dict:
    if '_id' in tag:
        tag['id'] = str(tag['_id'])
        del tag['_id']
    return tag

def get_object_id(id_str: str):
    """Convert string to ObjectId, raise 404 if invalid"""
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=404, detail="Invalid ID format")

# Auth endpoints
@api_router.post("/auth/verify", response_model=AuthResponse)
async def verify_admin(auth: AuthRequest):
    """Verify if user is admin"""
    is_admin = secrets.compare_digest(auth.password, ADMIN_PASSWORD)
    return AuthResponse(
        is_admin=is_admin,
        message="Admin access granted" if is_admin else "Team member access"
    )

# Card endpoints
@api_router.get("/cards", response_model=List[dict])
async def get_cards(
    tag: Optional[str] = None,
    condition: Optional[str] = None,
    found: Optional[bool] = None,
    search: Optional[str] = None,
    include_image: bool = False,
    skip: int = 0,
    limit: int = 50
):
    """Get all cards with optional filters and pagination"""
    query = {}
    
    if tag:
        query['tags'] = tag
    if condition:
        query['condition'] = condition
    if found is not None:
        query['found'] = found
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    
    # Use aggregation for conditional projection to avoid loading images
    if not include_image:
        pipeline = [
            {'$match': query},
            {'$sort': {'created_at': -1}},
            {'$skip': skip},
            {'$limit': limit},
            {'$addFields': {
                'has_image': {'$cond': [{'$and': [{'$ne': ['$image', None]}, {'$ne': ['$image', '']}]}, True, False]}
            }},
            {'$project': {
                'name': 1, 'price_min': 1, 'price_max': 1, 'condition': 1,
                'tags': 1, 'notes': 1, 'deadline': 1, 'found': 1,
                'found_by': 1, 'found_at': 1, 'created_at': 1, 'updated_at': 1,
                'has_image': 1
            }}
        ]
        cards = await db.cards.aggregate(pipeline).to_list(limit)
    else:
        cards = await db.cards.find(query).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    return [card_to_dict(card) for card in cards]

@api_router.get("/cards/{card_id}")
async def get_card(card_id: str):
    """Get a single card by ID"""
    oid = get_object_id(card_id)
    card = await db.cards.find_one({'_id': oid})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card_to_dict(card)

@api_router.post("/cards", response_model=dict)
async def create_card(card: CardCreate):
    """Create a new card (Admin only)"""
    card_dict = card.dict()
    card_dict['found'] = False
    card_dict['found_by'] = None
    card_dict['found_at'] = None
    card_dict['created_at'] = datetime.utcnow()
    card_dict['updated_at'] = datetime.utcnow()
    
    result = await db.cards.insert_one(card_dict)
    card_dict['_id'] = result.inserted_id
    return card_to_dict(card_dict)

@api_router.put("/cards/{card_id}", response_model=dict)
async def update_card(card_id: str, card_update: CardUpdate):
    """Update a card (Admin only)"""
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    update_data = {k: v for k, v in card_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow()
    
    await db.cards.update_one(
        {'_id': oid},
        {'$set': update_data}
    )
    
    updated = await db.cards.find_one({'_id': oid})
    return card_to_dict(updated)

@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str):
    """Delete a card (Admin only)"""
    oid = get_object_id(card_id)
    result = await db.cards.delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"message": "Card deleted successfully"}

@api_router.post("/cards/{card_id}/found", response_model=dict)
async def mark_card_found(card_id: str, request: MarkFoundRequest):
    """Mark a card as found (Team member action)"""
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    await db.cards.update_one(
        {'_id': oid},
        {'$set': {
            'found': True,
            'found_by': request.found_by,
            'found_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }}
    )
    
    updated = await db.cards.find_one({'_id': oid})
    return card_to_dict(updated)

@api_router.post("/cards/{card_id}/unfound", response_model=dict)
async def mark_card_unfound(card_id: str):
    """Mark a card as not found (Admin action to reset)"""
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    await db.cards.update_one(
        {'_id': oid},
        {'$set': {
            'found': False,
            'found_by': None,
            'found_at': None,
            'updated_at': datetime.utcnow()
        }}
    )
    
    updated = await db.cards.find_one({'_id': oid})
    return card_to_dict(updated)

# Tag endpoints
@api_router.get("/tags", response_model=List[dict])
async def get_tags():
    """Get all available tags"""
    tags = await db.tags.find().to_list(100)
    return [tag_to_dict(tag) for tag in tags]

@api_router.post("/tags", response_model=dict)
async def create_tag(tag: TagCreate):
    """Create a new tag (Admin only)"""
    # Check if tag already exists
    existing = await db.tags.find_one({'name': tag.name})
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    
    tag_dict = tag.dict()
    result = await db.tags.insert_one(tag_dict)
    tag_dict['_id'] = result.inserted_id
    return tag_to_dict(tag_dict)

@api_router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str):
    """Delete a tag (Admin only)"""
    oid = get_object_id(tag_id)
    result = await db.tags.delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"message": "Tag deleted successfully"}

# Stats endpoint
@api_router.get("/stats")
async def get_stats():
    """Get dashboard statistics"""
    total_cards = await db.cards.count_documents({})
    found_cards = await db.cards.count_documents({'found': True})
    pending_cards = await db.cards.count_documents({'found': False})
    
    return {
        "total": total_cards,
        "found": found_cards,
        "pending": pending_cards
    }

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
