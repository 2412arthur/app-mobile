from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

mongo_url = os.environ.get('MONGO_URL', '')
if not mongo_url:
    logging.error("MONGO_URL environment variable is not set!")

client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[os.environ.get('DB_NAME', 'pokemon_cards_db')]
