from sqlalchemy import Boolean, Column, Integer, String, DateTime, Time, ForeignKey, Date
from sqlalchemy.orm import relationship
from .database import Base, engine
from datetime import datetime

Base.metadata.create_all(bind=engine)

class User(Base):
    __tablename__ = "users"
    admission_no = Column(String, primary_key=True, index=True)
    password = Column(String)
    role = Column(String, default="student")

# In backend/models.py
class FoodItem(Base):
    __tablename__ = "food_items"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    price_full = Column(Integer)
    price_half = Column(Integer, nullable=True)
    category = Column(String) 
    meal_type = Column(String) 
    has_portions = Column(Boolean, default=True)
    # Stock Logic Fields
    admin_base_stock = Column(Integer, default=0) # Original input
    prebook_pool = Column(Integer, default=0)    # 90% Breakfast / Dynamic Lunch
    walkin_pool = Column(Integer, default=0)     # 10% Breakfast / 10% Lunch
    is_walkin_only = Column(Boolean, default=False) # For Snacks

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.admission_no"))
    booking_date = Column(Date, default=datetime.utcnow().date())
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
    booking = relationship("Booking", back_populates="items")
    food_item = relationship("FoodItem") # Link to get the dish name

class Seat(Base):
    __tablename__ = "seats" 
    id = Column(Integer, primary_key=True, index=True)
    table_number = Column(Integer)
    seat_number = Column(Integer)

class SeatReservation(Base):
    __tablename__ = "seat_reservations"
    id = Column(Integer, primary_key=True, index=True)
    seat_id = Column(Integer, ForeignKey("seats.id"))
    booking_id = Column(Integer, ForeignKey("bookings.id"))
    time_slot = Column(String)
    reservation_date = Column(Date)
    booking = relationship("Booking", back_populates="booked_seats")
    seat = relationship("Seat")