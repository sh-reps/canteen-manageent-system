from sqlalchemy import Boolean, Column, Integer, String, DateTime, Time, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from .database import Base, engine
from . import time_logic

class User(Base):
    __tablename__ = "users"
    admission_no = Column(String, primary_key=True, index=True)
    password = Column(String)
    role = Column(String, default="student")
    email = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expiry = Column(DateTime, nullable=True)

# In backend/models.py
class FoodItem(Base):
    __tablename__ = "food_items"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    description = Column(Text, default="")
    image_url = Column(String, default="")
    price_full = Column(Integer)
    price_half = Column(Integer, default=0)
    category = Column(String)
    meal_type = Column(String)
    has_portions = Column(Boolean, default=True)
    is_walkin_only = Column(Boolean, default=False) # For Snacks
    is_countable = Column(Boolean, default=False)
    
    # Template fields used when initializing a new day's stock
    admin_base_stock = Column(Integer, default=0)
    prebook_pool = Column(Integer, default=0)
    walkin_pool = Column(Integer, default=0)
    breakfast_buffer = Column(Integer, default=0)

    # Relationship to day-based stock
    stocks = relationship("FoodStock", back_populates="food_item")

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


# New: Day-based stock table
class FoodStock(Base):
    __tablename__ = "food_stocks"
    id = Column(Integer, primary_key=True)
    food_item_id = Column(Integer, ForeignKey("food_items.id"))
    day_of_week = Column(String)  # e.g. 'monday', 'tuesday', ...
    admin_base_stock = Column(Integer, default=0)
    prebook_pool = Column(Integer, default=0)
    walkin_pool = Column(Integer, default=0)
    breakfast_buffer = Column(Integer, default=0)
    food_item = relationship("FoodItem", back_populates="stocks")

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.admission_no"))
    booking_date = Column(Date, default=time_logic.get_current_date)
    created_at = Column(DateTime, default=time_logic.get_current_datetime)  # New: order date/time
    scheduled_slot = Column(String, nullable=False)
    order_type = Column(String) # 'sit-in' or 'parcel'
    status = Column(String, default="confirmed")
    items = relationship("BookedItem", back_populates="booking")
    booked_seats = relationship("SeatReservation", back_populates="booking")

# This replaces the 'item_id' column in Bookings to allow 1-to-many items
class BookedItem(Base):
    __tablename__ = "booked_items"
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"))
    food_item_id = Column(Integer, ForeignKey("food_items.id"))
    quantity = Column(Integer, default=1, nullable=False)
    booking = relationship("Booking", back_populates="items")
    food_item = relationship("FoodItem") # Link to get the dish name

class Seat(Base):
    __tablename__ = "seats" 
    id = Column(Integer, primary_key=True, index=True)
    table_number = Column(Integer)
    seat_number = Column(Integer)
    section = Column(String, default='student', nullable=False) # Can be 'student' or 'staff'

class SeatReservation(Base):
    __tablename__ = "seat_reservations"
    id = Column(Integer, primary_key=True, index=True)
    seat_id = Column(Integer, ForeignKey("seats.id"))
    booking_id = Column(Integer, ForeignKey("bookings.id"))
    time_slot = Column(String)
    reservation_date = Column(Date)
    booking = relationship("Booking", back_populates="booked_seats")
    seat = relationship("Seat")

class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False)

class LogicRun(Base):
    __tablename__ = 'logic_runs'
    id = Column(Integer, primary_key=True)
    logic_name = Column(String, nullable=False) # e.g., 'lunch_1am'
    last_run_date = Column(Date, nullable=False)