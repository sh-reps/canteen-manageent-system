from sqlalchemy import Column, Integer, String, DateTime, Time, ForeignKey, Date
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
    category = Column(String, default="meal")

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.admission_no"))
    booking_date = Column(Date, default=datetime.utcnow().date())
    scheduled_slot = Column(String, nullable=False)
    order_type = Column(String) # 'sit-in' or 'parcel'
    status = Column(String, default="confirmed")

# This replaces the 'item_id' column in Bookings to allow 1-to-many items
class BookedItem(Base):
    __tablename__ = "booked_items"
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"))
    food_item_id = Column(Integer, ForeignKey("food_items.id"))

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