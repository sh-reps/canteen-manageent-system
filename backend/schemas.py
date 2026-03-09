from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class UserCreate(BaseModel):
    admission_no: str
    password: str
    role: Optional[str] = "student"

class UserLogin(BaseModel):
    admission_no: str
    password: str

class BookingCreate(BaseModel):
    admission_no: str
    item_ids: List[int]
    scheduled_slot: str
    order_type: str            
    seat_ids: Optional[List[int]] = []


class FoodItemCreate(BaseModel):
    name: str
    price_full: int
    category: str
    meal_type: str
    has_portions: bool = False


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
    scheduled_slot: str
    order_type: str
    status: str
    items: List[BookedItemResponse]
    booked_seats: List[SeatReservationResponse]
    meal_type: Optional[str] = None  # Will be set from items
    
    class Config:
        from_attributes = True