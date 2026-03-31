from fastapi import APIRouter, HTTPException
from bson import ObjectId
from typing import Optional
from datetime import datetime, timedelta

from database import db
from models.schemas import (
    CardCreate, CardUpdate, PhotoSubmission,
    ValidatePhotoRequest, RejectSubmissionRequest, MarkFoundRequest,
    ImageUploadRequest
)
from utils import doc_to_dict, get_object_id, save_base64_image, add_notification

router = APIRouter()


@router.get("/cards")
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


@router.get("/cards/count")
async def count_cards(
    tag: Optional[str] = None, condition: Optional[str] = None,
    found: Optional[bool] = None, search: Optional[str] = None,
    pending_validation: Optional[bool] = None
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
    total = await db.cards.count_documents(query)
    return {"total": total}


@router.get("/cards/{card_id}")
async def get_card(card_id: str):
    oid = get_object_id(card_id)
    card = await db.cards.find_one({'_id': oid})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return doc_to_dict(card)


@router.post("/cards")
async def create_card(card: CardCreate):
    card_dict = card.dict()
    if card_dict.get('image'):
        card_dict['image'] = save_base64_image(card_dict['image'])
    card_dict.update({
        'found': False, 'found_by': None, 'found_at': None,
        'validated': False, 'photo_submissions': [], 'validated_submission': None,
        'created_at': datetime.utcnow(), 'updated_at': datetime.utcnow()
    })
    result = await db.cards.insert_one(card_dict)
    card_dict['_id'] = result.inserted_id
    return doc_to_dict(card_dict)


@router.put("/cards/{card_id}")
async def update_card(card_id: str, card_update: CardUpdate):
    oid = get_object_id(card_id)
    update_data = {k: v for k, v in card_update.dict().items() if v is not None}
    if update_data.get('image'):
        update_data['image'] = save_base64_image(update_data['image'])
    update_data['updated_at'] = datetime.utcnow()
    await db.cards.update_one({'_id': oid}, {'$set': update_data})
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated) if updated else {"error": "Not found"}


@router.delete("/cards/{card_id}")
async def delete_card(card_id: str):
    oid = get_object_id(card_id)
    result = await db.cards.delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"message": "Card deleted"}


@router.post("/cards/{card_id}/found")
async def mark_card_found(card_id: str, request: MarkFoundRequest):
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    if request.is_vip:
        await db.cards.update_one({'_id': oid}, {'$set': {
            'found': True, 'found_by': request.found_by, 'found_by_contact': request.user_contact,
            'found_at': datetime.utcnow(), 'validated': True, 'updated_at': datetime.utcnow()
        }})
    else:
        if not request.front_image or not request.back_image:
            raise HTTPException(status_code=400, detail="Photos required")
        
        front_url = save_base64_image(request.front_image)
        back_url = save_base64_image(request.back_image)
        
        submission = {
            'id': str(ObjectId()), 'front_image': front_url, 'back_image': back_url,
            'submitted_by': request.found_by, 'user_contact': request.user_contact,
            'submitted_at': datetime.utcnow(), 'rejected': False, 'rejection_reason': None
        }
        
        await db.cards.update_one({'_id': oid}, {'$set': {
            'found': True, 'found_by': request.found_by, 'found_by_contact': request.user_contact,
            'found_at': datetime.utcnow(), 'updated_at': datetime.utcnow()
        }, '$push': {'photo_submissions': submission}})
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)


@router.post("/cards/{card_id}/submit-photos")
async def submit_photos(card_id: str, submission: PhotoSubmission):
    oid = get_object_id(card_id)
    existing = await db.cards.find_one({'_id': oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found")
    
    front_url = save_base64_image(submission.front_image)
    back_url = save_base64_image(submission.back_image)
    
    photo_submission = {
        'id': str(ObjectId()), 'front_image': front_url, 'back_image': back_url,
        'submitted_by': submission.submitted_by, 'user_contact': submission.user_contact,
        'submitted_at': datetime.utcnow(), 'rejected': False, 'rejection_reason': None
    }
    
    await db.cards.update_one({'_id': oid}, {
        '$push': {'photo_submissions': photo_submission},
        '$set': {'updated_at': datetime.utcnow()}
    })
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)


@router.post("/cards/{card_id}/validate-photo")
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
    
    card_name = existing.get('name', 'Unknown')
    reward = existing.get('reward', 0)
    await add_notification(selected['submitted_by'], f"🎉 Votre soumission pour '{card_name}' a été validée ! +{reward}€", "success")
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)


@router.post("/cards/{card_id}/reject-photo")
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
    
    all_rejected = all(s.get('rejected', False) for s in updated_submissions)
    
    update_data = {'photo_submissions': updated_submissions, 'updated_at': datetime.utcnow()}
    if all_rejected:
        update_data['found'] = False
        update_data['found_by'] = None
        update_data['found_at'] = None
    
    await db.cards.update_one({'_id': oid}, {'$set': update_data})
    
    if rejected_user:
        card_name = existing.get('name', 'Unknown')
        await add_notification(rejected_user, f"❌ Votre soumission pour '{card_name}' a été refusée. Motif: {request.reason}", "error")
    
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated)


@router.post("/cards/{card_id}/unfound")
async def mark_card_unfound(card_id: str):
    oid = get_object_id(card_id)
    await db.cards.update_one({'_id': oid}, {'$set': {
        'found': False, 'found_by': None, 'found_by_contact': None, 'found_at': None,
        'validated': False, 'photo_submissions': [], 'validated_submission': None,
        'updated_at': datetime.utcnow()
    }})
    updated = await db.cards.find_one({'_id': oid})
    return doc_to_dict(updated) if updated else {"error": "Not found"}


@router.post("/upload")
async def upload_image(request: ImageUploadRequest):
    url = save_base64_image(request.image)
    return {"url": url}
