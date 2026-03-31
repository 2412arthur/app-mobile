from fastapi import APIRouter, HTTPException

from database import db
from utils import doc_to_dict, get_object_id

router = APIRouter()


@router.get("/tags")
async def get_tags():
    tags = await db.tags.find().to_list(100)
    return [doc_to_dict(tag) for tag in tags]


@router.post("/tags")
async def create_tag(tag: dict):
    existing = await db.tags.find_one({'name': tag.get('name')})
    if existing:
        raise HTTPException(status_code=400, detail="Tag exists")
    result = await db.tags.insert_one(tag)
    tag['_id'] = result.inserted_id
    return doc_to_dict(tag)


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str):
    oid = get_object_id(tag_id)
    await db.tags.delete_one({'_id': oid})
    return {"message": "Tag deleted"}
