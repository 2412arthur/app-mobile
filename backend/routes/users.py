from fastapi import APIRouter, HTTPException

from database import db
from models.schemas import UserUpdate, PushTokenRequest
from utils import doc_to_dict, get_object_id, send_push_notification

router = APIRouter()


@router.get("/users")
async def get_users():
    users = await db.users.find().to_list(500)
    return [doc_to_dict(u) for u in users]


@router.get("/users/{user_id}")
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


@router.put("/users/{user_id}")
async def update_user(user_id: str, user_update: UserUpdate):
    oid = get_object_id(user_id)
    update_data = {k: v for k, v in user_update.dict().items() if v is not None}
    if update_data:
        await db.users.update_one({'_id': oid}, {'$set': update_data})
    updated = await db.users.find_one({'_id': oid})
    return doc_to_dict(updated) if updated else {"error": "Not found"}


@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str):
    if role not in ["admin", "vip", "team"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    oid = get_object_id(user_id)
    await db.users.update_one({'_id': oid}, {'$set': {'role': role}})
    return {"message": f"Role updated to {role}"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    oid = get_object_id(user_id)
    result = await db.users.delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


@router.get("/users/{user_id}/notifications")
async def get_notifications(user_id: str):
    oid = get_object_id(user_id)
    user = await db.users.find_one({'_id': oid})
    if not user:
        return []
    return user.get('notifications', [])


@router.delete("/users/{user_id}/notifications")
async def clear_notifications(user_id: str):
    oid = get_object_id(user_id)
    await db.users.update_one({'_id': oid}, {'$set': {'notifications': []}})
    return {"message": "Notifications cleared"}


@router.post("/users/{user_id}/push-token")
async def register_push_token(user_id: str, request: PushTokenRequest):
    oid = get_object_id(user_id)
    user = await db.users.find_one({'_id': oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({'_id': oid}, {'$set': {'push_token': request.push_token}})
    return {"message": "Push token registered"}


@router.delete("/users/{user_id}/push-token")
async def remove_push_token(user_id: str):
    oid = get_object_id(user_id)
    await db.users.update_one({'_id': oid}, {'$unset': {'push_token': 1}})
    return {"message": "Push token removed"}
