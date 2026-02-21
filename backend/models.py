from sqlalchemy import Column, String, Integer, DateTime, Float, ForeignKey
from .database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    admission_no = Column(String, primary_key=True, index=True) #
    password = Column(String)
    role = Column(String, default="student")

class FoodItem(Base):
    __tablename__ = "food_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    base_stock = Column(Integer)
    buffer_stock = Column(Integer) #


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.admission_no"))
    item_id = Column(Integer, ForeignKey("food_items.id"))
    booking_time = Column(DateTime, default=datetime.now) #
    status = Column(String, default="active") # For the 10-min grace logic