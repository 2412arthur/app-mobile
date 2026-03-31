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
from datetime import datetime, timedelta
import secrets
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'pokemon_cards_db')]

app = FastAPI()
api_router = APIRouter(prefix="/api")

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '1234')
ROLE_ADMIN = "admin"
ROLE_VIP = "vip"
ROLE_TEAM = "team"

# Models
class UserUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    paypal: Optional[str] = None

class CardBase(BaseModel):
    name: str
    image: Optional[str] = None
    price: Optional[float] = None
    reward: Optional[float] = None
    condition: str = "Good"
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
    front_image: str
    back_image: str
    submitted_by: str
    user_contact: str

class RejectSubmissionRequest(BaseModel):
    submission_id: str
    reason: str

class ValidatePhotoRequest(BaseModel):
    submission_id: str

class MarkFoundRequest(BaseModel):
    found_by: str
    user_contact: str
    is_vip: bool = False
    front_image: Optional[str] = None
    back_image: Optional[str] = None

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

def doc_to_dict(doc: dict) -> dict:
    if '_id' in doc:
        doc['id'] = str(doc['_id'])
        del doc['_id']
    return doc

def get_object_id(id_str: str):
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=404, detail="Invalid ID format")

# Auth endpoints
@api_router.post("/auth/admin")
async def admin_login(data: dict):
    password = data.get('password', '')
    is_admin = secrets.compare_digest(password, ADMIN_PASSWORD)
    return {"is_admin": is_admin}

@api_router.post("/auth/login", response_model=AuthResponse)
async def login_or_register(auth: AuthRequest):
    is_admin = auth.password and secrets.compare_digest(auth.password, ADMIN_PASSWORD)
    user = await db.users.find_one({'name': auth.name, 'contact': auth.contact})
    
    if not user:
        new_user = {
            'name': auth.name, 'contact': auth.contact,
            'role': ROLE_ADMIN if is_admin else ROLE_TEAM,
            'paypal': None, 'balance': 0.0,
            'notifications': [],
            'created_at': datetime.utcnow()
        }
        result = await db.users.insert_one(new_user)
        user = await db.users.find_one({'_id': result.inserted_id})
    elif is_admin and user.get('role') != ROLE_ADMIN:
        await db.users.update_one({'_id': user['_id']}, {'$set': {'role': ROLE_ADMIN}})
        user['role'] = ROLE_ADMIN
    
    role = user.get('role', ROLE_TEAM)
    return AuthResponse(is_admin=(role == ROLE_ADMIN), is_vip=(role == ROLE_VIP), role=role, user_id=str(user['_id']), message="Connexion réussie")

# User endpoints
@api_router.get("/users")
async def get_users():
    users = await db.users.find().to_list(500)
    return [doc_to_dict(u) for u in users]

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    oid = get_object_id(user_id)
    user = await db.users.find_one({'_id': oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    validated_cards = await db.cards.find({'validated': True, 'validated_submission.submitted_by': user.get('name')}).to_list(100)
    rejected_submissions = await db.cards.find({'photo_submissions': {'$elemMatch': {'submitted_by': user.get('name'), 'rejected': True}}}).to_list(100)
    pending_submissions = await db.cards.find({'photo_submissions': {'$elemMatch': {'submitted_by': user.get('name'), 'rejected': {'$ne': True}}}, 'validated': {'$ne': True}}).to_list(100)
    
    user_dict = doc_to_dict(user)
    user_dict['validated_cards'] = [doc_to_dict(c) for c in validated_cards]
    user_dict['rejected_submissions'] = [doc_to_dict(c) for c in rejected_submissions]
    user_dict['pending_submissions'] = [doc_to_dict(c) for c in pending_submissions]
    user_dict['total_rewards'] = sum(c.get('reward', 0) or 0 for c in validated_cards)
    
    return user_dict

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user_update: UserUpdate):
    oid = get_object_id(user_id)
    update_data = {k: v for k, v in user_update.dict().items() if v is not None}
    if update_data:
        await db.users.update_one({'_id': oid}, {'$set': update_data})
    updated = await db.users.find_one({'_id': oid})
    return doc_to_dict(updated) if updated else {"error": "Not found"}

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str):
    if role not in [ROLE_ADMIN, ROLE_VIP, ROLE_TEAM]:
        raise HTTPException(status_code=400, detail="Invalid role")
    oid = get_object_id(user_id)
    await db.users.update_one({'_id': oid}, {'$set': {'role': role}})
    return {"message": f"Role updated to {role}"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    oid = get_object_id(user_id)
    result = await db.users.delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# Notifications
@api_router.get("/users/{user_id}/notifications")
async def get_notifications(user_id: str):
    oid = get_object_id(user_id)
    user = await db.users.find_one({'_id': oid})
    if not user:
        return []
    return user.get('notifications', [])

@api_router.delete("/users/{user_id}/notifications")
async def clear_notifications(user_id: str):
    oid = get_object_id(user_id)
    await db.users.update_one({'_id': oid}, {'$set': {'notifications': []}})
    return {"message": "Notifications cleared"}

# Push Token registration
class PushTokenRequest(BaseModel):
    push_token: str

@api_router.post("/users/{user_id}/push-token")
async def register_push_token(user_id: str, request: PushTokenRequest):
    oid = get_object_id(user_id)
    user = await db.users.find_one({'_id': oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({'_id': oid}, {'$set': {'push_token': request.push_token}})
    return {"message": "Push token registered"}

@api_router.delete("/users/{user_id}/push-token")
async def remove_push_token(user_id: str):
    oid = get_object_id(user_id)
    await db.users.update_one({'_id': oid}, {'$unset': {'push_token': 1}})
    return {"message": "Push token removed"}

async def send_push_notification(push_token: str, title: str, body: str, data: dict = None):
    """Send push notification via Expo Push API"""
    if not push_token or not push_token.startswith('ExponentPushToken'):
        return
    message = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
    }
    if data:
        message["data"] = data
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=message,
                headers={"Content-Type": "application/json"}
            )
    except Exception as e:
        logging.error(f"Push notification error: {e}")

async def add_notification(user_name: str, message: str, type: str = "info"):
    # Save in-app notification
    await db.users.update_one(
        {'name': user_name},
        {'$push': {'notifications': {'message': message, 'type': type, 'created_at': datetime.utcnow().isoformat(), 'read': False}}}
    )
    # Send push notification
    user = await db.users.find_one({'name': user_name})
    if user and user.get('push_token'):
        title = "PokéCollection" if type == "info" else ("Validé !" if type == "success" else "Refusé")
        await send_push_notification(user['push_token'], title, message)

# Card endpoints
@api_router.get("/cards")
async def get_cards(
    tag: Optional[str] = None, condition: Optional[str] = None,
    found: Optional[bool] = None, search: Optional[str] = None,
    pending_validation: Optional[bool] = None,
    sort_by: Optional[str] = None,
    include_image: bool = False, skip: int = 0, limit: int = 50
):
    query = {}
    if tag: query['tags'] = tag
    if condition: query['condition'] = condition
    if found is not None: query['found'] = found
    if search: query['name'] = {'$regex': search, '$options': 'i'}
    if pending_validation:
        query['found'] = True
        query['validated'] = {'$ne': True}
        query['photo_submissions.0'] = {'$exists': True}
    
    sort_field = 'created_at'
    sort_order = -1
    if sort_by == 'reward_desc':
        sort_field = 'reward'
        sort_order = -1
    elif sort_by == 'reward_asc':
        sort_field = 'reward'
        sort_order = 1
    elif sort_by == 'deadline':
        sort_field = 'deadline'
        sort_order = 1
    
    if not include_image:
        pipeline = [
            {'$match': query},
            {'$sort': {sort_field: sort_order}},
            {'$skip': skip},
            {'$limit': limit},
            {'$addFields': {
                'has_image': {'$cond': [{'$and': [{'$ne': ['$image', None]}, {'$ne': ['$image', '']}]}, True, False]},
                'submission_count': {'$size': {'$ifNull': ['$photo_submissions', []]}},
                'is_urgent': {'$cond': [
                    {'$and': [
                        {'$ne': ['$deadline', None]},
                        {'$lte': ['$deadline', (datetime.utcnow() + timedelta(days=2)).isoformat()]}
                    ]},
                    True, False
                ]}
            }},
            {'$project': {
                'name': 1, 'price': 1, 'reward': 1, 'condition': 1,
                'tags': 1, 'notes': 1, 'deadline': 1, 'found': 1,
                'found_by': 1, 'found_at': 1, 'created_at': 1, 'updated_at': 1,
                'has_image': 1, 'validated': 1, 'submission_count': 1,
                'validated_submission': 1, 'is_urgent': 1
            }}
        ]
        cards = await db.cards.aggregate(pipeline).to_list(limit)
    else:
        cards = await db.cards.find(query).sort(sort_field, sort_order).skip(skip).limit(limit).to_list(limit)
    
    return [doc_to_dict(card) for card in cards]

@api_router.get("/cards/{card_id}")
async def get_card(card_id: str):
    oid = get_object_id(card_id)
    card = await db.cards.find_one({'_id': oid})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return doc_to_dict(card)

@api_router.post("/cards")
async def create_card(card: CardCreate):
    card_dict = card.dict()
    card_dict.update({
        'found': False, 'found_by': None, 'found_at': None,
        'validated': False, 'photo_submissions': [], 'validated_submission': None,
        'created_at': datetime.utcnow(), 'updated_at': datetime.utcnow()
    })
    result = await db.cards.insert_one(card_dict)
    card_dict['_id'] = result.inserted_id
    return doc_to_dict(card_dict)

@api_router.put("/cards/{card_id}")
async def update_card(card_id: str, card_update: CardUpdate):
    oid = get_object_id(card_id)
    update_data = {k: v for k, v in card_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow()
    await db.cards.update_one({'_id': oid}, {'$set': update_data})
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated) if updated else {"error": "Not found"}

@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str):
    oid = get_object_id(card_id)
    result = await db.cards.delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"message": "Card deleted"}

@api_router.post("/cards/{card_id}/found")
async def mark_card_found(card_id: str, request: MarkFoundRequest):
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    # VIP can mark without photos
    if request.is_vip:
        await db.cards.update_one({'_id': oid}, {'$set': {
            'found': True, 'found_by': request.found_by, 'found_by_contact': request.user_contact,
            'found_at': datetime.utcnow(), 'validated': True, 'updated_at': datetime.utcnow()
        }})
    else:
        # Non-VIP must provide photos
        if not request.front_image or not request.back_image:
            raise HTTPException(status_code=400, detail="Photos required")
        
        submission = {
            'id': str(ObjectId()), 'front_image': request.front_image, 'back_image': request.back_image,
            'submitted_by': request.found_by, 'user_contact': request.user_contact,
            'submitted_at': datetime.utcnow(), 'rejected': False, 'rejection_reason': None
        }
        
        await db.cards.update_one({'_id': oid}, {'$set': {
            'found': True, 'found_by': request.found_by, 'found_by_contact': request.user_contact,
            'found_at': datetime.utcnow(), 'updated_at': datetime.utcnow()
        }, '$push': {'photo_submissions': submission}})
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

@api_router.post("/cards/{card_id}/submit-photos")
async def submit_photos(card_id: str, submission: PhotoSubmission):
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    photo_submission = {
        'id': str(ObjectId()), 'front_image': submission.front_image, 'back_image': submission.back_image,
        'submitted_by': submission.submitted_by, 'user_contact': submission.user_contact,
        'submitted_at': datetime.utcnow(), 'rejected': False, 'rejection_reason': None
    }
    
    await db.cards.update_one({'_id': oid}, {
        '$push': {'photo_submissions': photo_submission},
        '$set': {'updated_at': datetime.utcnow()}
    })
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

@api_router.post("/cards/{card_id}/validate-photo")
async def validate_photo(card_id: str, request: ValidatePhotoRequest):
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    submissions = existing.get('photo_submissions', [])
    selected = next((s for s in submissions if s['id'] == request.submission_id), None)
    if not selected:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    await db.cards.update_one({'_id': oid}, {'$set': {
        'validated': True, 'validated_submission': selected, 'updated_at': datetime.utcnow()
    }})
    
    # Notify user
    card_name = existing.get('name', 'Unknown')
    reward = existing.get('reward', 0)
    await add_notification(selected['submitted_by'], f"🎉 Votre soumission pour '{card_name}' a été validée ! +{reward}€", "success")
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

@api_router.post("/cards/{card_id}/reject-photo")
async def reject_photo(card_id: str, request: RejectSubmissionRequest):
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    submissions = existing.get('photo_submissions', [])
    updated_submissions = []
    rejected_user = None
    
    for sub in submissions:
        if sub['id'] == request.submission_id:
            sub['rejected'] = True
            sub['rejection_reason'] = request.reason
            rejected_user = sub['submitted_by']
        updated_submissions.append(sub)
    
    # Check if all submissions are rejected
    all_rejected = all(s.get('rejected', False) for s in updated_submissions)
    
    update_data = {'photo_submissions': updated_submissions, 'updated_at': datetime.utcnow()}
    if all_rejected:
        update_data['found'] = False
        update_data['found_by'] = None
        update_data['found_at'] = None
    
    await db.cards.update_one({'_id': oid}, {'$set': update_data})
    
    # Notify user
    if rejected_user:
        card_name = existing.get('name', 'Unknown')
        await add_notification(rejected_user, f"❌ Votre soumission pour '{card_name}' a été refusée. Motif: {request.reason}", "error")
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)

@api_router.post("/cards/{card_id}/unfound")
async def mark_card_unfound(card_id: str):
    oid = get_object_id(card_id)
    await db.cards.update_one({'_id': oid}, {'$set': {
        'found': False, 'found_by': None, 'found_by_contact': None, 'found_at': None,
        'validated': False, 'photo_submissions': [], 'validated_submission': None,
        'updated_at': datetime.utcnow()
    }})
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated) if updated else {"error": "Not found"}

# Tags
@api_router.get("/tags")
async def get_tags():
    tags = await db.tags.find().to_list(100)
    return [doc_to_dict(tag) for tag in tags]

@api_router.post("/tags")
async def create_tag(tag: dict):
    existing = await db.tags.find_one({'name': tag.get('name')})
    if existing:
        raise HTTPException(status_code=400, detail="Tag exists")
    result = await db.tags.insert_one(tag)
    tag['_id'] = result.inserted_id
    return doc_to_dict(tag)

@api_router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str):
    oid = get_object_id(tag_id)
    await db.tags.delete_one({'_id': oid})
    return {"message": "Tag deleted"}

# Stats
@api_router.get("/stats")
async def get_stats():
    total = await db.cards.count_documents({})
    found = await db.cards.count_documents({'found': True})
    validated = await db.cards.count_documents({'validated': True})
    pending = await db.cards.count_documents({'found': True, 'validated': {'$ne': True}})
    
    # Top hunters
    pipeline = [
        {'$match': {'validated': True, 'validated_submission': {'$ne': None}}},
        {'$group': {'_id': '$validated_submission.submitted_by', 'count': {'$sum': 1}, 'total_rewards': {'$sum': '$reward'}}},
        {'$sort': {'count': -1}},
        {'$limit': 10}
    ]
    top_hunters = await db.cards.aggregate(pipeline).to_list(10)
    
    # Cards found today
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    found_today = await db.cards.count_documents({'found_at': {'$gte': today}})
    
    # Urgent cards
    urgent_deadline = datetime.utcnow() + timedelta(days=2)
    urgent = await db.cards.count_documents({
        'found': False,
        'deadline': {'$ne': None, '$lte': urgent_deadline.isoformat()}
    })
    
    return {
        'total': total, 'found': found, 'validated': validated,
        'pending_validation': pending, 'pending': total - found,
        'found_today': found_today, 'urgent': urgent,
        'top_hunters': [{'name': h['_id'], 'count': h['count'], 'rewards': h['total_rewards']} for h in top_hunters]
    }

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

app.include_router(api_router)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
