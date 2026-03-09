import os

from fastapi import APIRouter, FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import date, datetime



# Import your local files
from . import models, schemas, database, stock_logic
from .database import engine, get_db

# Create the database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Canteen Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins, including your Live Server
    allow_credentials=True,
    allow_methods=["*"], # Allows GET, POST, etc.
    allow_headers=["*"], # Allows all headers
)


import os
from fastapi.staticfiles import StaticFiles

# Absolute path of the backend folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Point to the frontend folder
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# serving pages logic
@app.get("/")
async def serve_login():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/booking")
async def serve_booking():
    return FileResponse(os.path.join(FRONTEND_DIR, "booking.html"))

@app.get("/admin")
async def serve_admin():
    return FileResponse(os.path.join(FRONTEND_DIR, "admin.html"))

@app.get("/register")
async def serve_register():
    return FileResponse(os.path.join(FRONTEND_DIR, "register.html"))

@app.get("/history")
async def serve_history():
    return FileResponse(os.path.join(FRONTEND_DIR, "history.html"))

@app.get("/food-items", response_model=List[schemas.FoodItem])
def get_all_food(db: Session = Depends(get_db)):
    """Fetch all available food items for the menu."""
    return db.query(models.FoodItem).all()

@app.get("/available-seats/{slot}")
def get_seats_by_slot(slot: str, db: Session = Depends(get_db)):
    """
    Fetch all seats and their occupancy status for a specific time slot.
    Returns a list of seats with an 'is_occupied' boolean.
    """
    # Fetch all seats
    all_seats = db.query(models.Seat).all()
    
    # Check which seats are reserved for THIS slot on THIS day
    reserved_seat_ids = db.query(models.SeatReservation.seat_id).filter(
        models.SeatReservation.time_slot == slot,
        models.SeatReservation.reservation_date == date.today()
    ).all()
    
    # Flatten the list of IDs
    occupied_ids = [r[0] for r in reserved_seat_ids]
    
    # Return formatted list for the frontend circles
    return [
        {
            "id": seat.id,
            "table_number": seat.table_number,
            "seat_number": seat.seat_number,
            "is_occupied": seat.id in occupied_ids
        } for seat in all_seats
    ]

# ==========================================
# 2. CORE BOOKING LOGIC (THE TRANSACTION)
# ==========================================




router = APIRouter()
get_db = database.get_db

@app.post("/book-multiple", status_code=status.HTTP_201_CREATED)
def process_full_booking(booking_data: schemas.BookingCreate, db: Session = Depends(get_db)):
    # 1. Debug Logs to verify incoming data
    current_time_str = datetime.now().strftime("%H:%M")
    booking_cutoff = "23:59"

    print(f"DEBUG: Incoming booking data -> {booking_data}")
    
    # 2. Find the User using 'admission_no' (NOT 'id')
    user = db.query(models.User).filter(
        models.User.admission_no == booking_data.admission_no
    ).first()
    
    if not user:
        print(f"❌ ERROR: User {booking_data.admission_no} not found")
        raise HTTPException(status_code=404, detail="User not found")
    
    
    # 2. String comparison for the constraint
    if current_time_str > booking_cutoff:
        raise HTTPException(
            status_code=400, 
            detail="Pre-bookings for today close at 10:00 AM. kindly check walk-in options."
        )
    
    try:
        # 3. Create the Main Booking Record
        new_booking = models.Booking(
            user_id=user.admission_no, # FIXED: Uses admission_no instead of id
            scheduled_slot=booking_data.scheduled_slot, # Accepts the string '12:00:00'
            order_type=booking_data.order_type,
            booking_date=date.today(),
            status="confirmed"
        )
        db.add(new_booking)
        db.flush() # Flushes to generate new_booking.id for child tables

        # 4. Save Multiple Food Items to 'booked_items' table
        for f_id in booking_data.item_ids:
            booked_item = models.BookedItem(
                booking_id=new_booking.id,
                food_item_id=f_id
            )
            db.add(booked_item)

        # 5. Handle Seat Reservations if it's a 'sit-in' order
        if booking_data.order_type == "sit-in":
            if not booking_data.seat_ids:
                raise Exception("Seat selection is required for Sit-in orders.")
            
            for s_id in booking_data.seat_ids:
                # Check if seat is already reserved for this slot/day
                already_taken = db.query(models.SeatReservation).filter(
                    models.SeatReservation.seat_id == s_id,
                    models.SeatReservation.time_slot == booking_data.scheduled_slot,
                    models.SeatReservation.reservation_date == date.today()
                ).first()

                if already_taken:
                    raise Exception(f"Seat {s_id} was just taken. Please pick another.")

                res = models.SeatReservation(
                    seat_id=s_id,
                    booking_id=new_booking.id,
                    time_slot=booking_data.scheduled_slot,
                    reservation_date=date.today()
                )
                db.add(res)

        # 6. Commit the entire transaction
        db.commit()
        db.refresh(new_booking)
        print(f"✅ SUCCESS: Booking {new_booking.id} created for {user.admission_no}")
        return {"message": "Booking successful!", "booking_id": new_booking.id}

    except Exception as e:
        db.rollback()
        # This will now print the exact error (like table mismatches)
        print(f"❌ DATABASE ERROR: {str(e)}") 
        raise HTTPException(status_code=400, detail=str(e))

# ==========================================
# 3. AUTHENTICATION PLACEHOLDERS
# ==========================================

@app.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    exists = db.query(models.User).filter(models.User.admission_no == user_data.admission_no).first()
    if exists:
        raise HTTPException(status_code=400, detail="Admission number already registered")
    new_user = models.User(admission_no=user_data.admission_no, password=user_data.password)
    db.add(new_user)
    db.commit()
    return {"message": "Success"}

@app.post("/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.admission_no == user_data.admission_no,
        models.User.password == user_data.password
    ).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
        
    return {
        "message": "Success", 
        "admission_no": user.admission_no,
        "role": user.role  # Required for the frontend redirect logic
    }

#==========================================
#  ORDER HISTORY ENDPOINT 

@app.get("/order-history/{admission_no}", response_model=List[schemas.BookingResponse])
def get_order_history(admission_no: str, db: Session = Depends(get_db)):
    history = db.query(models.Booking).options(
        # Load food items and their names
        joinedload(models.Booking.items).joinedload(models.BookedItem.food_item),
        # Load seat reservations and the actual seat numbers
        joinedload(models.Booking.booked_seats).joinedload(models.SeatReservation.seat)
    ).filter(
        models.Booking.user_id == admission_no
    ).order_by(models.Booking.booking_date.desc()).all()
    
    # Add meal_type to each booking based on first item
    for booking in history:
        if booking.items and len(booking.items) > 0:
            booking.meal_type = booking.items[0].food_item.meal_type
        else:
            booking.meal_type = 'lunch'  # default
    
    return history


#==========================================
# Check capacity endpoint
#==========================================
@app.get("/check-capacity/{slot}")
def check_capacity(slot: str, db: Session = Depends(get_db)):
    booked_count = db.query(models.SeatReservation).filter(
        models.SeatReservation.time_slot == slot,
        models.SeatReservation.reservation_date == date.today()
    ).count()
    # Ensure this returns 'remaining' so booking.js can read it
    return {"slot": slot, "remaining": max(0, 50 - booked_count)}

#==========================================
# Cancel Order Endpoint
#==========================================
@app.post("/bookings/{booking_id}/cancel")
def cancel_order(booking_id: int, db: Session = Depends(get_db)):
    """
    Cancel a booking and return items to the prebook pool.
    Breakfast: Can cancel before 7:00 AM
    Lunch: Can cancel before 9:00 AM
    """
    # Get the booking
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Check if order status is "confirmed"
    if booking.status != "confirmed":
        raise HTTPException(status_code=400, detail=f"Cannot cancel {booking.status} order")
    
    # Determine meal type from the first item in the order
    if not booking.items or len(booking.items) == 0:
        raise HTTPException(status_code=400, detail="No items in this booking")
    
    meal_type = booking.items[0].food_item.meal_type
    
    # Check time-based cancellation rules
    now = datetime.now().time()
    
    if meal_type == 'breakfast':
        # Can cancel before 7:00 AM
        cutoff_time = datetime.strptime("07:00:00", "%H:%M:%S").time()
        if now >= cutoff_time:
            raise HTTPException(status_code=400, detail="Breakfast orders cannot be cancelled after 7:00 AM")
    elif meal_type == 'lunch':
        # Can cancel before 9:00 AM
        cutoff_time = datetime.strptime("09:00:00", "%H:%M:%S").time()
        if now >= cutoff_time:
            raise HTTPException(status_code=400, detail="Lunch orders cannot be cancelled after 9:00 AM")
    
    # Return items to prebook pool
    for booked_item in booking.items:
        food_item = booked_item.food_item
        food_item.prebook_pool += 1  # Add one unit back to prebook pool
    
    # If order was sit-in, free up the seats
    for seat_reservation in booking.booked_seats:
        db.delete(seat_reservation)
    
    # Update booking status
    booking.status = "cancelled"
    db.commit()
    
    return {"status": "success", "message": "Order cancelled successfully! Items returned to stock."}

#==========================================
# Admin Routes
#==========================================
@app.get("/all-bookings")
def get_all_bookings(db: Session = Depends(get_db)):
    # Fetch all bookings for today, including linked food and seat data
    return db.query(models.Booking).options(
        joinedload(models.Booking.items).joinedload(models.BookedItem.food_item),
        joinedload(models.Booking.booked_seats).joinedload(models.SeatReservation.seat)
    ).filter(models.Booking.booking_date == date.today()).all()
# main.py additions

@app.get("/users")
def get_all_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()

@app.delete("/users/{admission_no}")
def delete_user(admission_no: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if user:
        db.delete(user)
        db.commit()
    return {"status": "success"}

@app.delete("/food-items/{food_id}")
def delete_food(food_id: int, db: Session = Depends(get_db)):
    item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if item:
        db.delete(item)
        db.commit()
    return {"status": "success"}

@app.post("/complete-order/{order_id}")
def complete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(models.Booking).filter(models.Booking.id == order_id).first()
    if order:
        order.status = "collected" # Updates the status column
        db.commit()
    return {"status": "success"}


@app.post("/food-items", status_code=201)
def create_food_item(item: schemas.FoodItemCreate, db: Session = Depends(get_db)):
    # The 'id' will be generated by the database automatically
    new_item = models.FoodItem(
        name=item.name,
        price_full=item.price_full,
        category=item.category,
        meal_type=item.meal_type,
        has_portions=item.has_portions,
        admin_base_stock=0,
        prebook_pool=0,
        walkin_pool=0
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

# Admin Trigger for Stock Logic
@app.post("/admin/trigger-logic/{time_slot}")
def trigger_logic(time_slot: str, db: Session = Depends(get_db)):
    if time_slot == "1am":
        stock_logic.process_1am_lunch_recalc(db)
    elif time_slot == "7am":
        stock_logic.process_7am_breakfast_rollover(db)
    elif time_slot == "11am":
        stock_logic.process_11am_lunch_rollover(db)
    return {"status": "success", "message": f"Executed {time_slot} logic"}

# This endpoint allows admins to manually update stock pools for a food item
@app.patch("/food-items/{food_id}/stock")
def update_stock(food_id: int, data: schemas.StockUpdate, db: Session = Depends(get_db)):
    item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food not found")
    
    # Update the base stock
    item.admin_base_stock = data.admin_base_stock
    
    # Calculate pools based on meal type
    if item.meal_type == 'breakfast':
        item.prebook_pool = int(data.admin_base_stock * 0.9)
        item.walkin_pool = int(data.admin_base_stock * 0.1)
    else:  # lunch or others, demand-driven
        item.prebook_pool = 0
        item.walkin_pool = data.admin_base_stock
    
    db.commit()
    return {"status": "updated"}