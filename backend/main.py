

import os
import sys
print("[DEBUG] main.py loaded!")
print("[DEBUG] CWD:", os.getcwd())
print("[DEBUG] PYTHON:", sys.executable)

from fastapi import APIRouter, FastAPI, Depends, HTTPException, status, Query, Body, Request
app = FastAPI(title="Canteen Management System API")

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import date, datetime
from pydantic import BaseModel, EmailStr
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# --- Email Configuration ---
# WARNING: Do NOT use this in production. Use environment variables.
# For Gmail, you need to create an "App Password".
# See: https://support.google.com/accounts/answer/185833
conf = ConnectionConfig(
    MAIL_USERNAME = "lbscanteensystem@gmail.com", # <-- CHANGE THIS
    MAIL_PASSWORD = "ognw mgwy wbhu jdwb",      # <-- CHANGE THIS
    MAIL_FROM = "lbscanteensystem@gmail.com",     # <-- CHANGE THIS
    MAIL_PORT = 587,
    MAIL_SERVER = "smtp.gmail.com",
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True
)

# Import your local files
from . import models, schemas, database, stock_logic, time_logic
from .database import engine, get_db

# Endpoint to check if 1am/7am logic has run for today
@app.get("/stock-logic-status")
def get_stock_logic_status(db: Session = Depends(get_db)):
    from . import time_logic, models
    today = time_logic.get_current_date()

    runs = db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).all()
    run_names = {run.logic_name for run in runs}

    return {
        "lunch_1am": "lunch_1am" in run_names,
        "breakfast_5pm": "breakfast_5pm" in run_names,
        "breakfast_7am": "breakfast_7am" in run_names,
        "lunch_11am": "lunch_11am" in run_names,
    }

# Create the database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

# Auto-apply missing columns to Supabase so you don't have to run terminal commands manually
from sqlalchemy import text
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE booked_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;"))
        # Automatically add the section column to seats and safely assign the default value to existing rows
        conn.execute(text("ALTER TABLE seats ADD COLUMN IF NOT EXISTS section VARCHAR DEFAULT 'student';"))
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';"))
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS image_url VARCHAR DEFAULT '';"))
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS price_half INTEGER DEFAULT 0;"))
        # Forcefully drop the old unique constraint to stop the 500 errors
        conn.execute(text("ALTER TABLE logic_runs DROP CONSTRAINT IF EXISTS logic_runs_logic_name_key;"))
except Exception as e:
    print(f"[DEBUG] Schema auto-update error: {e}")

# --- Self-healing: Ensure staff seats exist ---
try:
    db = database.SessionLocal()
    staff_seat_count = db.query(models.Seat).filter(models.Seat.section == 'staff').count()
    if staff_seat_count == 0:
        print("[INFO] No staff seats found. Creating them now...")
        # Create 20 staff seats
        for i in range(1, 21):
            table_num = (i - 1) // 4 + 1
            seat_num = (i - 1) % 4 + 1
            db.add(models.Seat(table_number=table_num, seat_number=seat_num, section='staff'))
        db.commit()
        print("✅ SUCCESS: Staff seats created automatically.")
finally:
    db.close()

import asyncio

async def automated_stock_logic_runner():
    """Background task that polls simulated time to trigger stock logic automatically."""
    print("[INFO] Background stock logic scheduler started.")
    last_checked_minute = None
    while True:
        try:
            now = time_logic.get_current_datetime()
            current_minute = (now.year, now.month, now.day, now.hour, now.minute)
            
            # Only hit the database when the clock's minute rolls over
            if current_minute != last_checked_minute:
                db = database.SessionLocal()
                try:
                    stock_logic.evaluate_time_triggers(db)
                finally:
                    db.close()
                last_checked_minute = current_minute
        except Exception as e:
            print(f"[BACKGROUND TASK ERROR] {e}")
        
        # Super fast 1-second polling (very efficient since it's just checking memory)
        await asyncio.sleep(1) 

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(automated_stock_logic_runner())


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins, including your Live Server
    allow_credentials=True,
    allow_methods=["*"], # Allows GET, POST, etc.
    allow_headers=["*"], # Allows all headers
)


# Absolute path of the backend folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Point to the frontend folder
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

# Serve static files for JS and CSS
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
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

@app.get("/forgot-password")
async def serve_forgot_password():
    return FileResponse(os.path.join(FRONTEND_DIR, "forgot-password.html"))

@app.get("/reset-password")
async def serve_reset_password():
    return FileResponse(os.path.join(FRONTEND_DIR, "reset-password.html"))

class TimeModel(BaseModel):
    time: str

class DateModel(BaseModel):
    date: str

class DateTimeModel(BaseModel):
    date: str
    time: str

@app.post("/api/admin/set-time")
def set_time(time_data: TimeModel, db: Session = Depends(get_db)):
    time_logic.set_simulated_time(time_data.time)
    # Wipe today's logic runs to allow repeatable testing of triggers
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db)
    return {"message": f"Time set to {time_data.time}"}

@app.post("/api/admin/set-date")
def set_date(date_data: DateModel, db: Session = Depends(get_db)):
    time_logic.set_simulated_date(date_data.date)
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db)
    return {"message": f"Date set to {date_data.date}"}

@app.post("/api/admin/set-datetime")
def set_datetime(data: DateTimeModel, db: Session = Depends(get_db)):
    time_logic.set_simulated_datetime(data.date, data.time)
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db)
    return {"message": "Date and Time updated successfully."}

@app.post("/api/admin/reset-time")
def reset_time(db: Session = Depends(get_db)):
    time_logic.reset_simulation()
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db)
    return {"message": "System time reset to real time."}

@app.get("/api/time")
def get_time():
    return {"time": time_logic.get_current_time().isoformat()}
    

@app.get("/food-items")
def get_all_food(day: str = Query(None), db: Session = Depends(get_db)):
    """Fetch all available food items for the menu, for a specific day of week (e.g. 'monday')."""
    # Use new day-based stock logic
    from . import stock_logic
    return stock_logic.get_all_food_items(db, day)

@app.get("/available-seats/{section}/{slot}/{booking_date}")
def get_seats_by_slot(section: str, slot: str, booking_date: date, db: Session = Depends(get_db)):
    """
    Fetch all seats and their occupancy status for a specific time slot and date.
    Returns a list of seats with an 'is_occupied' boolean.
    """
    # Add a check for valid sections to prevent errors
    if section not in ['student', 'staff']:
        raise HTTPException(status_code=400, detail="Invalid section specified. Must be 'student' or 'staff'.")

    # Fetch seats for the specified section
    all_seats = db.query(models.Seat).filter(models.Seat.section == section).all()
    
    # Check which seats are reserved for THIS slot on the specified day
    reserved_seat_ids = db.query(models.SeatReservation.seat_id).filter(
        models.SeatReservation.time_slot == slot,
        models.SeatReservation.reservation_date == booking_date
    ).all()
    
    # Flatten the list of IDs
    occupied_ids = [r[0] for r in reserved_seat_ids]
    
    # Return formatted list for the frontend circles
    return [
        {
            "id": seat.id,
            "table_number": seat.table_number,
            "seat_number": seat.seat_number,
            "section": seat.section,
            "is_occupied": seat.id in occupied_ids
        } for seat in all_seats
    ]

# ==========================================
# 2. CORE BOOKING LOGIC (THE TRANSACTION)
# ==========================================

@app.post("/book-multiple", status_code=status.HTTP_201_CREATED)
def process_full_booking(booking_data: schemas.BookingCreate, db: Session = Depends(get_db)):
    # 1. Debug Logs to verify incoming data
    print(f"DEBUG: Incoming booking data -> {booking_data}")
    
    # 2. Find the User using 'admission_no'
    user = db.query(models.User).filter(
        models.User.admission_no == booking_data.admission_no
    ).first()
    
    if not user:
        print(f"❌ ERROR: User {booking_data.admission_no} not found")
        raise HTTPException(status_code=404, detail="User not found")
    
    # 3. Check for Holidays and Weekends on the requested booking date
    booking_date = booking_data.booking_date
    if booking_date.weekday() >= 5: # Monday is 0 and Sunday is 6
        raise HTTPException(status_code=400, detail="Bookings are not available on weekends.")
    
    is_holiday = db.query(models.Holiday).filter(models.Holiday.date == booking_date).first()
    if is_holiday:
        raise HTTPException(status_code=400, detail="Bookings are not available on a holiday.")
    
    try:
        # 4. Create the Main Booking Record
        new_booking = models.Booking(
            user_id=user.admission_no,
            scheduled_slot=booking_data.scheduled_slot,
            order_type=booking_data.order_type,
            booking_date=booking_date,
            status="confirmed"
        )
        db.add(new_booking)
        db.flush()

        # 5. Save food items and handle stock logic
        from .time_logic import get_current_date, get_current_time
        from .stock_logic import get_or_create_stock
        current_date = get_current_date()
        current_time = get_current_time()

        # Sort items by item_id to prevent database deadlocks during concurrent bookings
        sorted_items = sorted(booking_data.items, key=lambda x: x.item_id)

        for cart_item in sorted_items:
            booked_item = models.BookedItem(booking_id=new_booking.id, food_item_id=cart_item.item_id, quantity=cart_item.quantity)
            db.add(booked_item)

            # --- Live Base Stock Update ---
            # Increment the base stock for the item on its booking day immediately.
            day_of_week_for_booking = booking_data.booking_date.strftime('%A').lower()
            stock_for_booking_day = get_or_create_stock(db, cart_item.item_id, day_of_week_for_booking)
            stock_for_booking_day.admin_base_stock += cart_item.quantity

            food_item = db.query(models.FoodItem).filter(models.FoodItem.id == cart_item.item_id).first()

            # Stock is only depleted for SAME-DAY bookings AFTER the recalculation cutoff.
            # Before the cutoff, pre-booking is unlimited.
            if booking_data.booking_date == current_date:
                deplete_stock = False
                if food_item.meal_type == 'lunch' and current_time.hour >= 1:
                    deplete_stock = True
                elif food_item.meal_type == 'breakfast' and current_time.hour >= 6: # Use new 6am cutoff
                    deplete_stock = True

                if deplete_stock:
                    # Note: We use stock_for_booking_day here as it's a same-day booking
                    if stock_for_booking_day.prebook_pool >= cart_item.quantity:
                        stock_for_booking_day.prebook_pool -= cart_item.quantity
                    else:
                        raise HTTPException(status_code=400, detail=f"Not enough pre-book stock for {food_item.name}. Available: {stock_for_booking_day.prebook_pool}, Requested: {cart_item.quantity}.")

        # 6. Handle Seat Reservations
        if booking_data.order_type == "sit-in":
            if not booking_data.seat_ids:
                raise Exception("Seat selection is required for Sit-in orders.")
            for s_id in booking_data.seat_ids:
                already_taken = db.query(models.SeatReservation).filter(
                    models.SeatReservation.seat_id == s_id,
                    models.SeatReservation.time_slot == booking_data.scheduled_slot,
                    models.SeatReservation.reservation_date == booking_date
                ).first()
                if already_taken:
                    raise Exception(f"Seat {s_id} was just taken. Please pick another.")
                res = models.SeatReservation(
                    seat_id=s_id,
                    booking_id=new_booking.id,
                    time_slot=booking_data.scheduled_slot,
                    reservation_date=booking_date
                )
                db.add(res)

        # 7. Commit the transaction
        db.commit()
        db.refresh(new_booking)
        print(f"✅ SUCCESS: Booking {new_booking.id} created for {user.admission_no} on {booking_date}")
        return {"message": "Booking successful!", "booking_id": new_booking.id}

    except Exception as e:
        db.rollback()
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
    
    hashed_password = get_password_hash(user_data.password)
    new_user = models.User(
        admission_no=user_data.admission_no, 
        password=hashed_password,
        email=user_data.email,
        role=user_data.role # Assign the role from the request
    )
    db.add(new_user)
    db.commit()
    return {"message": "Success"}

@app.post("/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.admission_no == user_data.admission_no
    ).first()
    
    if not user or not verify_password(user_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
        
    return {
        "message": "Success", 
        "admission_no": user.admission_no,
        "role": user.role  # Required for the frontend redirect logic
    }

@app.post("/api/forgot-password")
async def forgot_password(req: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.admission_no == req.admission_no).first()
    
    # To prevent user enumeration, always return a generic success message.
    # The email is only sent if the user and email actually exist.
    if not user or not user.email:
        return {"message": "If an account with that admission number exists and has an email, a reset link has been sent."}
    
    try:
        import secrets
        from datetime import datetime, timedelta
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expiry = datetime.utcnow() + timedelta(hours=1)
        db.commit()

        reset_link = f"http://127.0.0.1:8000/reset-password?token={token}"
        html_body = f"""
        <p>Hello,</p>
        <p>You requested a password reset. Click the link below to reset your password (valid for 1 hour):</p>
        <p><a href="{reset_link}">{reset_link}</a></p>
        <p>If you did not request this, please ignore this email.</p>
        """

        message = MessageSchema(
            subject="Canteen Password Reset Request",
            recipients=[user.email],
            body=html_body,
            subtype=MessageType.html)

        fm = FastMail(conf)
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send email: {e}")
        # Even if email fails, don't expose the error to the user.

    return {"message": "If an account with that admission number exists and has an email, a reset link has been sent."}

@app.post("/api/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    from datetime import datetime
    user = db.query(models.User).filter(models.User.reset_token == req.token).first()
    if not user or not user.reset_token_expiry or user.reset_token_expiry < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired token.")
    
    user.password = get_password_hash(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()
    return {"message": "Password updated successfully."}

#==========================================
# HOLIDAY MANAGEMENT
#==========================================

@app.get("/api/holidays", response_model=List[schemas.Holiday])
def get_holidays(db: Session = Depends(get_db)):
    """Returns a list of all official holidays."""
    return db.query(models.Holiday).order_by(models.Holiday.date).all()

@app.post("/api/holidays", status_code=status.HTTP_201_CREATED, response_model=schemas.Holiday)
def create_holiday(holiday: schemas.HolidayCreate, db: Session = Depends(get_db)):
    """Adds a new date to the holidays list."""
    exists = db.query(models.Holiday).filter(models.Holiday.date == holiday.date).first()
    if exists:
        raise HTTPException(status_code=400, detail="This date is already marked as a holiday.")
    
    new_holiday = models.Holiday(date=holiday.date)
    db.add(new_holiday)
    db.commit()
    db.refresh(new_holiday)
    return new_holiday

@app.delete("/api/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)):
    """Deletes a holiday by its ID."""
    holiday = db.query(models.Holiday).filter(models.Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found.")
    db.delete(holiday)
    db.commit()

#==========================================
#  ORDER HISTORY ENDPOINT 

@app.get("/order-history/{admission_no}")
def get_order_history(admission_no: str, db: Session = Depends(get_db)):
    # Fetch all bookings for the user, most recent first
    from sqlalchemy.orm import joinedload
    bookings = db.query(models.Booking).options(
        joinedload(models.Booking.items).joinedload(models.BookedItem.food_item),
        joinedload(models.Booking.booked_seats).joinedload(models.SeatReservation.seat)
    ).filter(models.Booking.user_id == admission_no).order_by(models.Booking.created_at.desc()).all()

    # Set meal_type for each booking (from first item)
    result = []
    for b in bookings:
        booking_dict = schemas.BookingResponse.from_orm(b).dict()
        if b.items and hasattr(b.items[0].food_item, 'meal_type'):
            booking_dict['meal_type'] = b.items[0].food_item.meal_type
        result.append(booking_dict)
    return result


#==========================================
# Check capacity endpoint
#==========================================
@app.get("/check-capacity/{section}/{slot}/{booking_date}")
def check_capacity(section: str, slot: str, booking_date: date, db: Session = Depends(get_db)):
    # Dynamically count the total seats for the given section
    total_seats_in_section = db.query(models.Seat).filter(models.Seat.section == section).count()

    booked_count = db.query(models.SeatReservation).filter(
        models.SeatReservation.time_slot == slot,
        models.SeatReservation.reservation_date == booking_date
    ).count()
    
    remaining_seats = max(0, total_seats_in_section - booked_count)
    return {"slot": slot, "remaining": remaining_seats}

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

    # Determine refund eligibility and where to return stock
    current_datetime = time_logic.get_current_datetime()
    
    refund_eligible = False
    return_to_prebook = True
    
    if meal_type == 'breakfast':
        cutoff_datetime = datetime.combine(booking.booking_date, datetime.strptime("07:00:00", "%H:%M:%S").time())
        if current_datetime < cutoff_datetime:
            refund_eligible = True
            return_to_prebook = True
        else:
            refund_eligible = False
            return_to_prebook = False  # After 7am on booking day, goes to walk-in
    elif meal_type == 'lunch':
        cutoff_datetime = datetime.combine(booking.booking_date, datetime.strptime("09:00:00", "%H:%M:%S").time())
        if current_datetime < cutoff_datetime:
            refund_eligible = True
            return_to_prebook = True
        else:
            refund_eligible = False
            return_to_prebook = False  # After 9am on booking day, goes to walk-in

    # Return items to correct pool
    day_of_week = booking.booking_date.strftime('%A').lower()
    
    # Sort items by food_item_id to prevent deadlocks
    sorted_cancel_items = sorted(booking.items, key=lambda x: x.food_item_id)
    for booked_item in sorted_cancel_items:
        quantity_to_return = booked_item.quantity
        # Get the correct stock record for the booking date
        stock = stock_logic.get_or_create_stock(db, booked_item.food_item_id, day_of_week)
        # Decrement the base stock that was added when the order was placed
        stock.admin_base_stock = max(0, stock.admin_base_stock - quantity_to_return)

        if return_to_prebook:
            stock.prebook_pool += quantity_to_return
        else:
            stock.walkin_pool += quantity_to_return

    # If order was sit-in, free up the seats
    for seat_reservation in booking.booked_seats:
        db.delete(seat_reservation)

    # Update booking status
    booking.status = "cancelled"
    db.commit()

    msg = "Order cancelled successfully! "
    if refund_eligible:
        msg += "Refund will be processed. Items returned to pre-book pool."
    else:
        msg += "No refund (cancelled after cutoff). Items moved to walk-in pool."
    return {"status": "success", "message": msg}

#==========================================
# Admin Routes
#==========================================
@app.get("/all-bookings")
def get_all_bookings(date: str = Query(None), db: Session = Depends(get_db)):
    # Fetch all bookings for a specific booking_date (default: today)
    if date:
        try:
            query_date = datetime.strptime(date, "%Y-%m-%d").date()
        except Exception:
            query_date = time_logic.get_current_date()
    else:
        query_date = time_logic.get_current_date()
    bookings = db.query(models.Booking).options(
        joinedload(models.Booking.items).joinedload(models.BookedItem.food_item),
        joinedload(models.Booking.booked_seats).joinedload(models.SeatReservation.seat)
    ).filter(models.Booking.booking_date == query_date).order_by(models.Booking.created_at.desc()).all()
    
    return [schemas.BookingResponse.from_orm(b) for b in bookings]
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

@app.patch("/users/{admission_no}/email")
def update_user_email(admission_no: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.email = payload.get("email")
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
async def create_food_item(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    # The 'id' will be generated by the database automatically
    new_item = models.FoodItem(
        name=data.get("name"),
        price_full=data.get("price_full"),
        price_half=data.get("price_half", 0),
        category=data.get("category"),
        meal_type=data.get("meal_type"),
        has_portions=data.get("has_portions", False),
        is_countable=data.get("is_countable", False),
        description=data.get("description", ""),
        image_url=data.get("image_url", ""),
        admin_base_stock=0,
        prebook_pool=0,
        walkin_pool=0,
        breakfast_buffer=0
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@app.patch("/api/food-items/{food_id}")
async def edit_food_item(food_id: int, request: Request, db: Session = Depends(get_db)):
    item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")
    
    update_data = await request.json()
    for key, value in update_data.items():
        setattr(item, key, value)
        
    db.commit()
    db.refresh(item)
    return item

# Admin Trigger for Stock Logic
@app.post("/admin/trigger-logic/{time_slot}")
def trigger_logic(time_slot: str, db: Session = Depends(get_db)):
    if time_slot == "1am":
        stock_logic.process_1am_lunch_recalc(db)
    elif time_slot == "5pm":
        stock_logic.process_5pm_breakfast_recalc(db)
    elif time_slot == "7am":
        stock_logic.process_7am_breakfast_rollover(db)
    elif time_slot == "11am":
        stock_logic.process_11am_lunch_rollover(db)
    return {"status": "success", "message": f"Executed {time_slot} logic"}

@app.post("/admin/seed-orders")
def seed_orders(payload: dict = Body(...), db: Session = Depends(get_db)):
    import random
    from datetime import datetime
    
    seed_date_str = payload.get("date")
    
    if not seed_date_str:
        raise HTTPException(status_code=400, detail="Missing date")
        
    seed_date = datetime.strptime(seed_date_str, "%Y-%m-%d").date()
    
    users = db.query(models.User).all()
    all_food_items = db.query(models.FoodItem).all()
    breakfast_items = [f for f in all_food_items if f.meal_type == 'breakfast']
    lunch_items = [f for f in all_food_items if f.meal_type == 'lunch']
    all_seats = db.query(models.Seat).all()
    
    if not users or not all_food_items:
        raise HTTPException(status_code=400, detail="Database needs users and food items to seed orders.")
        
    # Track used seats to avoid collisions during seeding
    existing_res = db.query(models.SeatReservation).filter(models.SeatReservation.reservation_date == seed_date).all()
    
    # Define all possible slots to correctly initialize the used_seats tracker
    all_possible_slots = ["08:00", "08:30", "09:00", "12:00", "12:15", "12:25", "12:30", "12:45", "12:50", "13:00", "13:15", "13:30"]
    used_seats = {slot: set() for slot in all_possible_slots}
    for r in existing_res:
        if r.time_slot in used_seats:
            used_seats[r.time_slot].add(r.seat_id)
            
    orders_created = 0
    stock_increments = {}

    for _ in range(200): # Generate 200 orders
        user = random.choice(users)
        meal_type = random.choice(["breakfast", "lunch"])
        food_items = breakfast_items if meal_type == "breakfast" else lunch_items
        
        if not food_items:
            continue # Skip if no items exist for this meal type
            
        main_meals = [f for f in food_items if f.category == 'meal']
        if not main_meals:
            main_meals = food_items # Fallback if no specific 'meal' category exists
            
        # Determine order type and slots for each iteration
        order_type = ""
        slots = []
        if meal_type == "breakfast":
            order_type = "sit-in"
            slots = ["08:00", "08:30", "09:00"]
        elif meal_type == "lunch":
            order_type = random.choice(["sit-in", "parcel"])
            if order_type == "sit-in":
                slots = ["12:00", "12:25", "12:50", "13:15"]
            else: # parcel
                slots = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"]
        
        if not slots: continue # Skip if meal type is not breakfast or lunch
        
        slot = random.choice(slots)
        seat_to_assign = None
        
        if order_type == "sit-in":
            user_section = 'staff' if user.role in ['staff', 'admin'] else 'student'
            available = [s for s in all_seats if s.section == user_section and s.id not in used_seats[slot]]
            if not available:
                continue # Skip this loop iteration if the section is fully booked for this slot
            seat_to_assign = random.choice(available)
            
        new_booking = models.Booking(user_id=user.admission_no, scheduled_slot=slot, order_type=order_type, booking_date=seed_date, status="confirmed")
        db.add(new_booking)
        db.flush() # Flush to get the new_booking.id
        
        # Select items for this order
        items_to_order = []
        main_meal = random.choice(main_meals)
        main_qty = random.randint(2, 5) if main_meal.is_countable else 1
        items_to_order.append((main_meal, main_qty))
        
        # Randomly add 0 to 2 extra items (curries, sides, drinks) to make the order realistic
        other_options = [f for f in food_items if f.id != main_meal.id]
        if other_options:
            num_extras = random.randint(0, 2)
            extras = random.sample(other_options, min(num_extras, len(other_options)))
            for extra in extras:
                extra_qty = random.randint(1, 3) if extra.is_countable else 1
                items_to_order.append((extra, extra_qty))

        for item, qty in items_to_order:
            db.add(models.BookedItem(booking_id=new_booking.id, food_item_id=item.id, quantity=qty))
            
            # Accumulate stock increments in memory to update all at once later
            stock_increments[item.id] = stock_increments.get(item.id, 0) + qty
        
        if order_type == "sit-in" and seat_to_assign:
            db.add(models.SeatReservation(seat_id=seat_to_assign.id, booking_id=new_booking.id, time_slot=slot, reservation_date=seed_date))
            used_seats[slot].add(seat_to_assign.id)
            
        orders_created += 1

    # Apply all stock updates in sorted order exactly ONCE to prevent deadlocks and ensure blazing fast speed
    from .stock_logic import get_or_create_stock
    day_of_week_for_seed = seed_date.strftime('%A').lower()
    
    for item_id in sorted(stock_increments.keys()):
        qty = stock_increments[item_id]
        stock_for_seed_day = get_or_create_stock(db, item_id, day_of_week_for_seed)
        stock_for_seed_day.admin_base_stock += qty
        
    db.commit()
    return {"status": "success", "message": f"Successfully generated {orders_created} mixed orders! Remember to trigger the time logic to recalculate stock."}

@app.post("/admin/clear-orders")
def clear_orders(payload: dict = Body(...), db: Session = Depends(get_db)):
    from datetime import datetime
    date_str = payload.get("date")
    
    if not date_str:
        raise HTTPException(status_code=400, detail="Missing date")
        
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    
    # Find all bookings for this date
    bookings = db.query(models.Booking).filter(models.Booking.booking_date == target_date).all()
    booking_ids = [b.id for b in bookings]
    
    if not booking_ids:
        return {"status": "success", "message": f"No orders found for {target_date}."}
        
    # Delete child records first to respect foreign key constraints
    db.query(models.SeatReservation).filter(models.SeatReservation.booking_id.in_(booking_ids)).delete(synchronize_session=False)
    db.query(models.BookedItem).filter(models.BookedItem.booking_id.in_(booking_ids)).delete(synchronize_session=False)
    db.query(models.Booking).filter(models.Booking.id.in_(booking_ids)).delete(synchronize_session=False)
    
    # Reset the live stock counters for that day so it's a completely clean slate
    day_of_week = target_date.strftime('%A').lower()
    db.query(models.FoodStock).filter(models.FoodStock.day_of_week == day_of_week).update(
        {"admin_base_stock": 0, "prebook_pool": 0, "walkin_pool": 0}, synchronize_session=False
    )
    
    db.commit()
    return {"status": "success", "message": f"Successfully cleared {len(booking_ids)} orders for {target_date} and reset the live stock."}

# --- Breakfast Specific Admin Endpoints ---
@app.post("/admin/set-breakfast-buffer/{food_id}")
async def set_breakfast_buffer(food_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        buffer_val = await request.json()
        buffer_val = int(buffer_val)
    except Exception:
        buffer_val = 0
        
    item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food item not found")
        
    item.breakfast_buffer = buffer_val
    db.commit()
    return {"status": "success", "message": "Buffer updated successfully"}

@app.post("/admin/lock-breakfast-base-stock")
def lock_breakfast_base_stock(db: Session = Depends(get_db)):
    import datetime
    tomorrow = time_logic.get_current_date() + datetime.timedelta(days=1)
    day_of_week = tomorrow.strftime('%A').lower()
    
    breakfast_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'breakfast').all()
    for item in breakfast_items:
        # Calling this automatically instantiates tomorrow's record from the template
        stock_logic.get_or_create_stock(db, item.id, day_of_week)
        
    return {"status": "success", "message": "Base stock locked for tomorrow."}

# Endpoint: Admin updates stock for a food item and day
@app.post("/food-items/{food_id}/stock")
def update_food_stock(food_id: int, day: str = Body(...), admin_base_stock: int = Body(...), prebook_pool: int = Body(...), walkin_pool: int = Body(...), breakfast_buffer: int = Body(0)):
    """Admin updates stock for a food item for a specific day of week."""
    from .database import SessionLocal
    from .models import FoodStock
    from .stock_logic import get_or_create_stock
    db = SessionLocal()
    stock = get_or_create_stock(db, food_id, day)
    stock.admin_base_stock = admin_base_stock
    stock.prebook_pool = prebook_pool
    stock.walkin_pool = walkin_pool
    stock.breakfast_buffer = breakfast_buffer
    db.commit()
    db.close()
    return {"message": "Stock updated", "food_id": food_id, "day": day}

# Endpoint: Admin manually updates live stock pools for a specific day
@app.patch("/api/stock/{day}/{food_id}")
def update_daily_stock(day: str, food_id: int, data: schemas.DailyStockUpdate, db: Session = Depends(get_db)):
    from .stock_logic import get_or_create_stock
    stock = get_or_create_stock(db, food_id, day)
    
    if data.admin_base_stock is not None:
        stock.admin_base_stock = data.admin_base_stock
    if data.prebook_pool is not None:
        stock.prebook_pool = data.prebook_pool
    if data.walkin_pool is not None:
        stock.walkin_pool = data.walkin_pool
    if data.breakfast_buffer is not None:
        stock.breakfast_buffer = data.breakfast_buffer
        
    db.commit()
    return {"status": "success", "message": "Daily stock updated successfully"}

# This endpoint allows admins to manually update stock pools for a food item
@app.patch("/food-items/{food_id}/stock")
def update_stock(food_id: int, data: schemas.DailyStockUpdate, db: Session = Depends(get_db)):
    item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Food not found")
    
    # This endpoint updates the TEMPLATE values on the FoodItem itself.
    # The get_or_create_stock function will use these values when creating a new daily stock record.
    if data.admin_base_stock is not None:
        item.admin_base_stock = data.admin_base_stock
    if data.prebook_pool is not None:
        item.prebook_pool = data.prebook_pool
    if data.walkin_pool is not None:
        item.walkin_pool = data.walkin_pool
    if data.breakfast_buffer is not None:
        item.breakfast_buffer = data.breakfast_buffer
    
    db.commit()
    return {"status": "updated"}