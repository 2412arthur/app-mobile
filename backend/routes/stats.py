from fastapi import APIRouter
from datetime import datetime, timedelta

from database import db

router = APIRouter()


@router.get("/stats")
async def get_stats():
    total = await db.cards.count_documents({})
    found = await db.cards.count_documents({'found': True})
    validated = await db.cards.count_documents({'validated': True})
    pending = await db.cards.count_documents({'found': True, 'validated': {'$ne': True}})
    
    pipeline = [
        {'$match': {'validated': True, 'validated_submission': {'$ne': None}}},
        {'$group': {'_id': '$validated_submission.submitted_by', 'count': {'$sum': 1}, 'total_rewards': {'$sum': '$reward'}}},
        {'$sort': {'count': -1}},
        {'$limit': 10}
    ]
    top_hunters = await db.cards.aggregate(pipeline).to_list(10)
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    found_today = await db.cards.count_documents({'found_at': {'$gte': today}})
    
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
