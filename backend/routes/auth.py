from fastapi import APIRouter
import secrets
import os
from datetime import datetime

from database import db
from models.schemas import AuthRequest, AuthResponse
from utils import doc_to_dict

router = APIRouter()

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '1234')
ROLE_ADMIN = "admin"
ROLE_VIP = "vip"
ROLE_TEAM = "team"


@router.post("/auth/admin")
async def admin_login(data: dict):
    password = data.get('password', '')
    is_admin = secrets.compare_digest(password, ADMIN_PASSWORD)
    return {"is_admin": is_admin}


@router.post("/auth/login", response_model=AuthResponse)
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
