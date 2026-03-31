from pydantic import BaseModel, Field
from typing import List, Optional


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


class PushTokenRequest(BaseModel):
    push_token: str


class ImageUploadRequest(BaseModel):
    image: str
