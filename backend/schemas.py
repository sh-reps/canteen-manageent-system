from pydantic import BaseModel, validator, EmailStr
from typing import List, Optional
from datetime import date, datetime

class UserCreate(BaseModel):
    admission_no: str
    password: str
    role: Optional[str] = "student"
    email: Optional[EmailStr] = None

    @validator('password')
    def password_length(cls, v):
        # bcrypt has a 72-byte limit for passwords. We check the byte length.
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long and cannot exceed 72 bytes.')
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long.')
        return v

class UserLogin(BaseModel):
    admission_no: str
    password: str

class ForgotPasswordRequest(BaseModel):
    admission_no: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @validator('new_password')
    def password_length(cls, v):
        # bcrypt has a 72-byte limit for passwords. We check the byte length.
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long and cannot exceed 72 bytes.')
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long.')
        return v

class CartItem(BaseModel):
    item_id: int
    quantity: int

class BookingCreate(BaseModel):
    admission_no: str
    items: List[CartItem]
    scheduled_slot: str
    order_type: str
    booking_date: date
    seat_ids: Optional[List[int]] = []

class FoodItemCreate(BaseModel):
    name: str
    price_full: int
    category: str
    meal_type: str
    has_portions: bool = False
    is_countable: bool = False

class FoodItemUpdate(BaseModel):
    name: Optional[str] = None
    price_full: Optional[int] = None
    category: Optional[str] = None
    meal_type: Optional[str] = None
    has_portions: Optional[bool] = None
    is_walkin_only: Optional[bool] = None
    is_countable: Optional[bool] = None

class FoodItem(FoodItemCreate):
    id: int
    admin_base_stock: int = 0
    prebook_pool: int = 0
    walkin_pool: int = 0
    is_walkin_only: bool = False

    class Config:
        from_attributes = True

# Schema for the Admin to manually update stocks
class StockUpdate(BaseModel):
    admin_base_stock: int
    breakfast_buffer: Optional[int] = None

    class Config:
        from_attributes = True

# Schemas for Order History
class SeatInfo(BaseModel):
    id: int
    table_number: int
    seat_number: int
    
    class Config:
        from_attributes = True

class BookedItemResponse(BaseModel):
    id: int
    food_item: FoodItem
    quantity: int
    
    class Config:
        from_attributes = True

class SeatReservationResponse(BaseModel):
    id: int
    seat: SeatInfo
    
    class Config:
        from_attributes = True

class BookingResponse(BaseModel):
    id: int
    user_id: str
    booking_date: date
    created_at: Optional[datetime] = None  # New: order date/time
    scheduled_slot: str
    order_type: str
    status: str
    items: List[BookedItemResponse]
    booked_seats: List[SeatReservationResponse]
    meal_type: Optional[str] = None  # Will be set from items
    
    class Config:
        from_attributes = True

class HolidayCreate(BaseModel):
    date: date

class Holiday(BaseModel):
    id: int
    date: date

    class Config:
        from_attributes = True