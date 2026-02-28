from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Time
from .database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    admission_no = Column(String, primary_key=True, index=True)
    password = Column(String)
    role = Column(String, default="student")

class FoodItem(Base):
    __tablename__ = "food_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    price = Column(Integer)
    base_stock = Column(Integer)
    buffer_stock = Column(Integer) 

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.admission_no"))
    item_id = Column(Integer, ForeignKey("food_items.id"))
    booking_time = Column(DateTime, default=datetime.utcnow)
    
    
    scheduled_slot = Column(Time) 
    order_type = Column(String) 
    status = Column(String, default="active")