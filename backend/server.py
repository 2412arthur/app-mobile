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

# Admin password
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'pokemon2025')

# User Roles
ROLE_ADMIN = "admin"
ROLE_VIP = "vip"
ROLE_TEAM = "team"

# Define Models
class UserCreate(BaseModel):
    name: str
    contact: str  # Instagram handle or phone number (06...)
    password: Optional[str] = None  # For admin

class User(BaseModel):
    name: str
    contact: str
    role: str = ROLE_TEAM  # admin, vip, team
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CardBase(BaseModel):
    name: str
    image: Optional[str] = None  # Base64 image
    price: Optional[float] = None  # Prix demandé
    reward: Optional[float] = None  # Récompense pour le trouveur
    condition: str = "Good"  # Mint, Near Mint, Excellent, Good, Poor
    tags: List[str] = []
    notes: Optional[str] = None
    deadline: Optional[str] = None

class CardCreate(CardBase):
    pass

class CardUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None
    price: Optional[float] = None
    reward: Optional[float] = None
    condition: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    deadline: Optional[str] = None

class PhotoSubmission(BaseModel):
    front_image: str  # Base64 high-res front
    back_image: str   # Base64 high-res back
    submitted_by: str
    user_contact: str

class MarkFoundRequest(BaseModel):
    found_by: str
    user_contact: str
    is_vip: bool = False

class ValidatePhotoRequest(BaseModel):
    submission_id: str

class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#FFCB05"  # Pokemon yellow default

class AuthRequest(BaseModel):
    name: str
    contact: str
    password: Optional[str] = None

class AuthResponse(BaseModel):
    is_admin: bool
    is_vip: bool
    role: str
    user_id: str
    message: str

# Helper to convert MongoDB document to dict
def doc_to_dict(doc: dict) -> dict:
    if '_id' in doc:
        doc['id'] = str(doc['_id'])
        del doc['_id']
    return doc

def get_object_id(id_str: str):
    """Convert string to ObjectId, raise 404 if invalid"""
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=404, detail="Invalid ID format")

# Auth endpoints
@api_router.post("/auth/login", response_model=AuthResponse)
async def login_or_register(auth: AuthRequest):
    """Login or register user"""
    # Check if admin
    is_admin = auth.password and secrets.compare_digest(auth.password, ADMIN_PASSWORD)
    
    # Find or create user
    user = await db.users.find_one({'name': auth.name, 'contact': auth.contact})
    
    if not user:
        # Create new user
        new_user = {
            'name': auth.name,
            'contact': auth.contact,
            'role': ROLE_ADMIN if is_admin else ROLE_TEAM,
            'created_at': datetime.utcnow()
        }
        result = await db.users.insert_one(new_user)
        user = await db.users.find_one({'_id': result.inserted_id})
    elif is_admin and user.get('role') != ROLE_ADMIN:
        # Upgrade to admin
        await db.users.update_one({'_id': user['_id']}, {'$set': {'role': ROLE_ADMIN}})
        user['role'] = ROLE_ADMIN
    
    role = user.get('role', ROLE_TEAM)
    
    return AuthResponse(
        is_admin=(role == ROLE_ADMIN),
        is_vip=(role == ROLE_VIP),
        role=role,
        user_id=str(user['_id']),
        message="Connexion réussie"
    )

# User management (admin only)
@api_router.get("/users")
async def get_users():
    """Get all users (admin only)"""
    users = await db.users.find().to_list(500)
    return [doc_to_dict(u) for u in users]

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str):
    """Update user role (admin only)"""
    if role not in [ROLE_ADMIN, ROLE_VIP, ROLE_TEAM]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    oid = get_object_id(user_id)
    result = await db.users.update_one({'_id': oid}, {'$set': {'role': role}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": f"Role updated to {role}"}

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
                'has_image': {'$cond': [{'$and': [{'$ne': ['$image', None]}, {'$ne': ['$image', '']}]}, True, False]},
                'submission_count': {'$size': {'$ifNull': ['$photo_submissions', []]}}
            }},
            {'$project': {
                'name': 1, 'price': 1, 'reward': 1, 'condition': 1,
                'tags': 1, 'notes': 1, 'deadline': 1, 'found': 1,
                'found_by': 1, 'found_at': 1, 'created_at': 1, 'updated_at': 1,
                'has_image': 1, 'validated': 1, 'submission_count': 1,
                'validated_submission': 1
            }}
        ]
        cards = await db.cards.aggregate(pipeline).to_list(limit)
    else:
        cards = await db.cards.find(query).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    return [doc_to_dict(card) for card in cards]

@api_router.get("/cards/{card_id}")
async def get_card(card_id: str):
    """Get a single card by ID with all details"""
    oid = get_object_id(card_id)
    card = await db.cards.find_one({'_id': oid})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return doc_to_dict(card)

@api_router.post("/cards", response_model=dict)
async def create_card(card: CardCreate):
    """Create a new card (Admin only)"""
    card_dict = card.dict()
    card_dict['found'] = False
    card_dict['found_by'] = None
    card_dict['found_at'] = None
    card_dict['validated'] = False
    card_dict['photo_submissions'] = []
    card_dict['validated_submission'] = None
    card_dict['created_at'] = datetime.utcnow()
    card_dict['updated_at'] = datetime.utcnow()
    
    result = await db.cards.insert_one(card_dict)
    card_dict['_id'] = result.inserted_id
    return doc_to_dict(card_dict)

@api_router.put("/cards/{card_id}", response_model=dict)
async def update_card(card_id: str, card_update: CardUpdate):
    """Update a card (Admin only)"""
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    update_data = {k: v for k, v in card_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow()
    
    await db.cards.update_one({'_id': oid}, {'$set': update_data})
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

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
    
    update_data = {
        'found': True,
        'found_by': request.found_by,
        'found_by_contact': request.user_contact,
        'found_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }
    
    # VIP users automatically validate without photos
    if request.is_vip:
        update_data['validated'] = True
    
    await db.cards.update_one({'_id': oid}, {'$set': update_data})
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

@api_router.post("/cards/{card_id}/submit-photos", response_model=dict)
async def submit_photos(card_id: str, submission: PhotoSubmission):
    """Submit photos for a found card"""
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    photo_submission = {
        'id': str(ObjectId()),
        'front_image': submission.front_image,
        'back_image': submission.back_image,
        'submitted_by': submission.submitted_by,
        'user_contact': submission.user_contact,
        'submitted_at': datetime.utcnow()
    }
    
    await db.cards.update_one(
        {'_id': oid},
        {
            '$push': {'photo_submissions': photo_submission},
            '$set': {'updated_at': datetime.utcnow()}
        }
    )
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

@api_router.post("/cards/{card_id}/validate-photo", response_model=dict)
async def validate_photo(card_id: str, request: ValidatePhotoRequest):
    """Validate a photo submission (Admin only)"""
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    # Find the submission
    submissions = existing.get('photo_submissions', [])
    selected_submission = None
    for sub in submissions:
        if sub['id'] == request.submission_id:
            selected_submission = sub
            break
    
    if not selected_submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    await db.cards.update_one(
        {'_id': oid},
        {'$set': {
            'validated': True,
            'validated_submission': selected_submission,
            'updated_at': datetime.utcnow()
        }}
    )
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

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
            'found_by_contact': None,
            'found_at': None,
            'validated': False,
            'photo_submissions': [],
            'validated_submission': None,
            'updated_at': datetime.utcnow()
        }}
    )
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

# Tag endpoints
@api_router.get("/tags", response_model=List[dict])
async def get_tags():
    """Get all available tags"""
    tags = await db.tags.find().to_list(100)
    return [doc_to_dict(tag) for tag in tags]

@api_router.post("/tags", response_model=dict)
async def create_tag(tag: TagCreate):
    """Create a new tag (Admin only)"""
    existing = await db.tags.find_one({'name': tag.name})
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    
    tag_dict = tag.dict()
    result = await db.tags.insert_one(tag_dict)
    tag_dict['_id'] = result.inserted_id
    return doc_to_dict(tag_dict)

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
    validated_cards = await db.cards.count_documents({'validated': True})
    pending_validation = await db.cards.count_documents({'found': True, 'validated': False})
    
    return {
        "total": total_cards,
        "found": found_cards,
        "validated": validated_cards,
        "pending_validation": pending_validation,
        "pending": total_cards - found_cards
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
