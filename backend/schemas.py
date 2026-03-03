from pydantic import BaseModel, field_validator
from datetime import datetime, time
from typing import List, Optional

# Data needed for Login
class LoginRequest(BaseModel):
    admission_no: str
    password: str

# Data needed to create a new Booking
class BookingCreate(BaseModel):
    admission_no: str
    item_ids: List[int]        
    scheduled_slot: str
    order_type: str            
    seat_ids: Optional[List[int]] = []

    
# What we send back to the user after a booking is made
class BookingResponse(BaseModel):
    id: int
    user_id: str
    item_id: int
    price: int
    scheduled_slot: time
    status: str

    class Config:
        from_attributes = True

#user regisration   
class UserCreate(BaseModel):
    admission_no: str
    password: str
    role: Optional[str] = "student" 

class UserResponse(BaseModel):
    admission_no: str
    role: str

    class Config:
        from_attributes = True

class LoginResponse(BaseModel):
    admission_no: str
    role: str
    message: str

    class Config:
        from_attributes = True

class FoodItem(BaseModel):
    id: int
    name: str
    price: int
    category: Optional[str] = "meal"

    class Config:
        from_attributes = True

# Add this: Main.py needs this for the /login endpoint
class UserLogin(BaseModel):
    admission_no: str
    password: str

# Ensure this matches what main.py expects for /book-multiple
class BookingCreate(BaseModel):
    admission_no: str
    item_ids: List[int]
    scheduled_slot: str
    order_type: str
    seat_ids: Optional[List[int]] = []

class MultiBookingCreate(BaseModel):
    admission_no: str
    item_ids: list[int] # List of IDs from the cart
    scheduled_slot: time
    order_type: str
    seat_ids: Optional[List[int]] = []

MultiBookingCreate.model_rebuild()
