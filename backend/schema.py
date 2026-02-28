from pydantic import BaseModel
from datetime import datetime, time
from typing import Optional

# Data needed for Login
class LoginRequest(BaseModel):
    admission_no: str
    password: str

# Data needed to create a new Booking
class BookingCreate(BaseModel):
    item_id: int
    scheduled_slot: time # e.g., "12:30:00"
    order_type: str # Must be 'sit-in' or 'take-away'

# What we send back to the user after a booking is made
class BookingResponse(BaseModel):
    id: int
    user_id: str
    item_id: int
    scheduled_slot: time
    status: str

    class Config:
        from_attributes = True