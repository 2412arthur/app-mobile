import uuid
import base64
import logging
from pathlib import Path
from bson import ObjectId
from fastapi import HTTPException
import httpx
from datetime import datetime

from database import db

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / 'uploads'
UPLOADS_DIR.mkdir(exist_ok=True)


def delete_image_file(url: str):
    """Delete an image file from disk given its /api/uploads/ URL"""
    if not url or not url.startswith('/api/uploads/'):
        return
    try:
        filename = url.split('/api/uploads/')[-1]
        filepath = UPLOADS_DIR / filename
        if filepath.exists():
            filepath.unlink()
    except Exception as e:
        logging.error(f"Image delete error: {e}")


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


def save_base64_image(base64_str: str) -> str:
    """Save a base64 image to disk and return the relative URL path"""
    if not base64_str:
        return base64_str
    if base64_str.startswith('/api/uploads/') or base64_str.startswith('http'):
        return base64_str
    try:
        if ',' in base64_str:
            header, data = base64_str.split(',', 1)
            ext = 'jpg'
            if 'png' in header:
                ext = 'png'
            elif 'webp' in header:
                ext = 'webp'
        else:
            data = base64_str
            ext = 'jpg'
        
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = UPLOADS_DIR / filename
        filepath.write_bytes(base64.b64decode(data))
        return f"/api/uploads/{filename}"
    except Exception as e:
        logging.error(f"Image save error: {e}")
        return base64_str


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
    await db.users.update_one(
        {'name': user_name},
        {'$push': {'notifications': {'message': message, 'type': type, 'created_at': datetime.utcnow().isoformat(), 'read': False}}}
    )
    user = await db.users.find_one({'name': user_name})
    if user and user.get('push_token'):
        title = "PokéCollection" if type == "info" else ("Validé !" if type == "success" else "Refusé")
        await send_push_notification(user['push_token'], title, message)
