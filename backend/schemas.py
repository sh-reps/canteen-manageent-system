from pydantic import BaseModel
from typing import List, Optional

class UserCreate(BaseModel):
    admission_no: str
    password: str
    role: Optional[str] = "student"

class UserLogin(BaseModel):
    admission_no: str
    password: str

class FoodItem(BaseModel):
    id: int
    name: str
    price_full: int
    price_half: Optional[int] = None 
    category: str               
    meal_type: str              
    has_portions: bool          

    class Config:
        from_attributes = True

class BookingCreate(BaseModel):
    admission_no: str
    item_ids: List[int]
    scheduled_slot: str
    order_type: str            
    seat_ids: Optional[List[int]] = []