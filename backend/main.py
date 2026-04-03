

import os
import sys
print("[DEBUG] main.py loaded!")
print("[DEBUG] CWD:", os.getcwd())
print("[DEBUG] PYTHON:", sys.executable)

from fastapi import APIRouter, FastAPI, Depends, HTTPException, status, Query, Body, Request
app = FastAPI(title="Canteen Management System API")

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
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
from .logic.utils import calculate_deposit_percentage

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
print("[INFO] Verifying database tables...")
models.Base.metadata.create_all(bind=engine)
print("[INFO] Database tables verified.")

# Auto-apply missing columns to Supabase so you don't have to run terminal commands manually
from sqlalchemy import text
try:
    print("[INFO] Applying schema updates...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE booked_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;"))
        # Automatically add the section column to seats and safely assign the default value to existing rows
        conn.execute(text("ALTER TABLE seats ADD COLUMN IF NOT EXISTS section VARCHAR DEFAULT 'student';"))
        conn.execute(text("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS drop_point VARCHAR;"))
        conn.execute(text("ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS created_by VARCHAR;"))
        conn.execute(text("ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS user_id VARCHAR;"))
        conn.execute(text("ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;"))
        conn.execute(text("ALTER TABLE IF EXISTS system_feedback ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'open';"))
        conn.execute(text("ALTER TABLE IF EXISTS system_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;"))
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';"))
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS image_url VARCHAR DEFAULT '';"))
        conn.execute(text("ALTER TABLE food_items ADD COLUMN IF NOT EXISTS price_half INTEGER DEFAULT 0;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON bookings(booking_date);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(booking_date, status);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_seat_reservations_slot_date ON seat_reservations(time_slot, reservation_date);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_booked_items_booking_id ON booked_items(booking_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_food_stocks_food_day ON food_stocks(food_item_id, day_of_week);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON system_feedback(user_id, created_at);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reviews_food_created ON food_reviews(food_item_id, created_at);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_logic_runs_date_name ON logic_runs(last_run_date, logic_name);"))
        # Forcefully drop the old unique constraint to stop the 500 errors
        conn.execute(text("ALTER TABLE logic_runs DROP CONSTRAINT IF EXISTS logic_runs_logic_name_key;"))
    print("[INFO] Schema updates applied.")
except Exception as e:
    print(f"[DEBUG] Schema auto-update error: {e}")

# --- Self-healing: Ensure staff seats exist ---
try:
    print("[INFO] Checking for staff seats...")
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
    else:
        print("[INFO] Staff seats already exist.")
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
app.add_middleware(GZipMiddleware, minimum_size=1000)


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

@app.get("/flagged_users")
async def serve_flagged_users():
    return FileResponse(os.path.join(FRONTEND_DIR, "flagged_users.html"))


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
    stock_logic.evaluate_time_triggers(db, skip_expiry=True)
    return {"message": f"Time set to {time_data.time}"}

@app.post("/api/admin/set-date")
def set_date(date_data: DateModel, db: Session = Depends(get_db)):
    time_logic.set_simulated_date(date_data.date)
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db, skip_expiry=True)
    return {"message": f"Date set to {date_data.date}"}

@app.post("/api/admin/set-datetime")
def set_datetime(data: DateTimeModel, db: Session = Depends(get_db)):
    time_logic.set_simulated_datetime(data.date, data.time)
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db, skip_expiry=True)
    return {"message": "Date and Time updated successfully."}

@app.post("/api/admin/reset-time")
def reset_time(db: Session = Depends(get_db)):
    time_logic.reset_simulation()
    today = time_logic.get_current_date()
    db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete(synchronize_session=False)
    db.commit()
    stock_logic.evaluate_time_triggers(db, skip_expiry=True)
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

    user_flags = user.flags or 0

    valid_drop_points = {"canteen", "cs block", "l block", "new block", "ad block"}
    normalized_drop_point = (booking_data.drop_point or "").strip().lower()

    if booking_data.order_type == "parcel":
        if not normalized_drop_point:
            raise HTTPException(status_code=400, detail="Drop point is required for parcel orders.")
        if normalized_drop_point not in valid_drop_points:
            raise HTTPException(status_code=400, detail="Invalid drop point selected.")

    # 2.5 Check if user has reached maximum flags (blocked from booking)
    if user_flags >= 5:
        raise HTTPException(status_code=403, detail="You have reached the maximum number of flags and cannot book orders. Please contact the admin to reset your flags.")

    item_ids = [c.item_id for c in booking_data.items]
    food_items = db.query(models.FoodItem).filter(models.FoodItem.id.in_(item_ids)).all() if item_ids else []
    food_items_by_id = {item.id: item for item in food_items}

    # Calculate deposit based on user flags
    deposit_percentage = calculate_deposit_percentage(user_flags)
    total_order_value = 0
    for cart_item in booking_data.items:
        item = food_items_by_id.get(cart_item.item_id)
        if item:
            # For simplicity, assuming full price for all items in deposit calculation
            total_order_value += item.price_full * cart_item.quantity
    
    deposit_amount = (total_order_value * deposit_percentage) / 100
    
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
            drop_point=normalized_drop_point if booking_data.order_type == "parcel" else None,
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
        day_of_week_for_booking = booking_data.booking_date.strftime('%A').lower()

        for cart_item in sorted_items:
            booked_item = models.BookedItem(booking_id=new_booking.id, food_item_id=cart_item.item_id, quantity=cart_item.quantity)
            db.add(booked_item)

            # --- Live Base Stock Update ---
            # Increment the base stock for the item on its booking day immediately.
            stock_for_booking_day = get_or_create_stock(db, cart_item.item_id, day_of_week_for_booking)
            stock_for_booking_day.admin_base_stock += cart_item.quantity

            food_item = food_items_by_id.get(cart_item.item_id)
            if not food_item:
                raise Exception(f"Food item {cart_item.item_id} not found.")

            # Stock is only depleted for SAME-DAY bookings AFTER the recalculation cutoff.
            # Before the cutoff, pre-booking is unlimited.
            if booking_data.booking_date == current_date:
                deplete_stock = False
                if food_item.meal_type == 'lunch' and current_time.hour >= 1:
                    deplete_stock = True
                elif food_item.meal_type == 'breakfast' and current_time.hour >= 6: # Use new 6am cutoff
                    deplete_stock = True

                if deplete_stock:
                    # Atomically update the stock to prevent race conditions.
                    # This performs the check and subtraction in a single database operation.
                    result = db.query(models.FoodStock).filter(
                        models.FoodStock.id == stock_for_booking_day.id,
                        models.FoodStock.prebook_pool >= cart_item.quantity
                    ).update({
                        'prebook_pool': models.FoodStock.prebook_pool - cart_item.quantity
                    }, synchronize_session=False)

                    # The 'result' is the number of rows updated. If it's 0, the WHERE clause failed.
                    if result == 0:
                        raise Exception(f"Sorry, {food_item.name} was just booked by someone else. Not enough stock.")
                        
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
                    raise Exception(f"Seat {s_id} was just taken while you were booking. Please pick another.")
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
        return {
            "message": "Booking successful!",
            "booking_id": new_booking.id,
            "deposit_percentage": deposit_percentage,
            "deposit_amount": deposit_amount
        }

    except Exception as e:
        db.rollback()
        print(f"❌ TRANSACTION FAILED: {str(e)}")
        # Provide a more user-friendly error for concurrency issues
        if "was just taken" in str(e) or "was just booked" in str(e):
            raise HTTPException(status_code=409, detail=str(e)) # 409 Conflict
        raise HTTPException(status_code=400, detail=f"Booking failed: {str(e)}")

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

    msg = "Order cancelled successfully!\n\n"
    if refund_eligible:
        msg += "✅ REFUND ISSUED: You cancelled before the kitchen cutoff time. Your items were returned to the pre-book pool."
    else:
        msg += "❌ NO REFUND: You cancelled after the kitchen cutoff time. Your items have been sent to the walk-in counter to avoid waste."
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
    users = db.query(models.User).all()
    return [
        {
            "admission_no": u.admission_no,
            "role": u.role,
            "email": u.email,
            "flags": u.flags or 0,
            "flagged_at": u.flagged_at,
        }
        for u in users
    ]


@app.get("/users/{admission_no}/flags")
def get_user_flags(admission_no: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"admission_no": user.admission_no, "flags": user.flags or 0}

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


@app.post("/mark-order-not-collected/{order_id}")
def mark_order_not_collected(order_id: int, db: Session = Depends(get_db)):
    """Marks an order as not collected and flags the user."""
    order = db.query(models.Booking).filter(models.Booking.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Only uncollected confirmed orders can be marked as not collected
    if order.status != "confirmed":
        raise HTTPException(status_code=400, detail=f"Cannot mark {order.status} order as not collected")
    
    # Get the user
    user = db.query(models.User).filter(models.User.admission_no == order.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mark order as not collected
    order.status = "not_collected"
    
    # Increment user flags (capped at 5)
    current_flags = user.flags or 0
    user.flags = min(current_flags + 1, 5)
    user.flagged_at = time_logic.get_current_datetime()
    
    db.commit()
    
    return {
        "status": "success",
        "message": f"Order marked as not collected. User {user.admission_no} now has {user.flags} flag(s).",
        "user_flags": user.flags,
        "flagged_at": user.flagged_at
    }


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
    elif time_slot == "10am":
        stock_logic.process_10am_breakfast_clear(db)
    elif time_slot == "11am":
        stock_logic.process_11am_lunch_rollover(db)
    elif time_slot == "2pm":
        stock_logic.process_2pm_lunch_clear(db)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown time slot: {time_slot}")
    return {"status": "success", "message": f"Executed {time_slot} logic"}

@app.post("/admin/seed-orders")
def seed_orders(payload: dict = Body(...), db: Session = Depends(get_db)):
    import random
    from datetime import datetime
    
    seed_date_str = payload.get("date")
    requested_count = payload.get("count", 200)
    
    if not seed_date_str:
        raise HTTPException(status_code=400, detail="Missing date")

    try:
        requested_count = int(requested_count)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="count must be an integer")

    if requested_count < 1:
        raise HTTPException(status_code=400, detail="count must be at least 1")

    # Keep this bounded so the endpoint stays responsive on lower-end machines.
    requested_count = min(requested_count, 2000)
        
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
    booking_plans = []
    food_map = {f.id: f for f in all_food_items}

    for _ in range(requested_count):
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
        seat_to_assign_id = None
        
        if order_type == "sit-in":
            user_section = 'staff' if user.role in ['staff', 'admin'] else 'student'
            available = [s.id for s in all_seats if s.section == user_section and s.id not in used_seats[slot]]
            if not available:
                continue # Skip this loop iteration if the section is fully booked for this slot
            seat_to_assign_id = random.choice(available)
        
        # Select items for this order
        items_to_order = []
        main_meal = random.choice(main_meals)
        main_qty = random.randint(2, 5) if main_meal.is_countable else 1
        items_to_order.append((main_meal.id, main_qty))
        
        # Randomly add 0 to 2 extra items (curries, sides, drinks) to make the order realistic
        other_options = [f for f in food_items if f.id != main_meal.id]
        if other_options:
            num_extras = random.randint(0, 2)
            extras = random.sample(other_options, min(num_extras, len(other_options)))
            for extra in extras:
                extra_qty = random.randint(1, 3) if extra.is_countable else 1
                items_to_order.append((extra.id, extra_qty))

        booking_plans.append({
            "user_id": user.admission_no,
            "slot": slot,
            "order_type": order_type,
            "seat_id": seat_to_assign_id,
            "items": items_to_order
        })

        if order_type == "sit-in" and seat_to_assign_id:
            used_seats[slot].add(seat_to_assign_id)

        orders_created += 1

    if not booking_plans:
        return {"status": "success", "message": "No orders generated. Check seats/users/menu setup."}

    # Batch-create bookings with a single flush to obtain all booking IDs
    new_bookings = [
        models.Booking(
            user_id=plan["user_id"],
            scheduled_slot=plan["slot"],
            order_type=plan["order_type"],
            booking_date=seed_date,
            status="confirmed"
        )
        for plan in booking_plans
    ]
    db.add_all(new_bookings)
    db.flush()

    # Batch-create booked items and seat reservations
    booked_item_rows = []
    seat_res_rows = []
    for plan, booking in zip(booking_plans, new_bookings):
        for item_id, qty in plan["items"]:
            booked_item_rows.append(
                models.BookedItem(booking_id=booking.id, food_item_id=item_id, quantity=qty)
            )
            stock_increments[item_id] = stock_increments.get(item_id, 0) + qty

        if plan["order_type"] == "sit-in" and plan["seat_id"]:
            seat_res_rows.append(
                models.SeatReservation(
                    seat_id=plan["seat_id"],
                    booking_id=booking.id,
                    time_slot=plan["slot"],
                    reservation_date=seed_date
                )
            )

    if booked_item_rows:
        db.bulk_save_objects(booked_item_rows)
    if seat_res_rows:
        db.bulk_save_objects(seat_res_rows)

    # Apply stock updates with one fetch pass and one commit
    day_of_week_for_seed = seed_date.strftime('%A').lower()

    item_ids = sorted(stock_increments.keys())
    existing_stocks = db.query(models.FoodStock).filter(
        models.FoodStock.day_of_week == day_of_week_for_seed,
        models.FoodStock.food_item_id.in_(item_ids)
    ).all() if item_ids else []

    stock_by_item = {s.food_item_id: s for s in existing_stocks}
    missing_item_ids = [item_id for item_id in item_ids if item_id not in stock_by_item]
    if missing_item_ids:
        missing_stocks = [
            models.FoodStock(
                food_item_id=item_id,
                day_of_week=day_of_week_for_seed,
                admin_base_stock=(food_map[item_id].admin_base_stock if item_id in food_map else 0),
                prebook_pool=0,
                walkin_pool=0,
                breakfast_buffer=(food_map[item_id].breakfast_buffer if item_id in food_map else 0)
            )
            for item_id in missing_item_ids
        ]
        db.add_all(missing_stocks)
        for stock in missing_stocks:
            stock_by_item[stock.food_item_id] = stock

    for item_id, qty in stock_increments.items():
        stock_by_item[item_id].admin_base_stock += qty
        
    db.commit()
    return {
        "status": "success",
        "message": f"Successfully generated {orders_created} mixed orders! Remember to trigger the time logic to recalculate stock.",
        "requested_count": requested_count,
        "generated_count": orders_created
    }

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

@app.post("/api/admin/reset-flags/{admission_no}", status_code=status.HTTP_200_OK)
def reset_user_flags(admission_no: str, db: Session = Depends(get_db)):
    """Resets a user's flags to 0."""
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.flags = 0
    user.flagged_at = None
    db.commit()
    return {"status": "success", "message": f"Flags for user {admission_no} have been reset."}

@app.get("/api/admin/flagged-users", response_model=List[schemas.User])
def get_flagged_users(db: Session = Depends(get_db)):
    """Returns a list of all users with flags > 0, ordered by most recently flagged."""
    return db.query(models.User).filter(models.User.flags > 0).order_by(models.User.flagged_at.desc()).all()



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

# ==========================================
# FOOD REVIEW ENDPOINTS
# ==========================================

@app.get("/api/reviews/food/{food_id}", response_model=dict)
def get_food_reviews(food_id: int, db: Session = Depends(get_db)):
    """Get all reviews for a food item with average rating"""
    
    # Check if food item exists
    food_item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not food_item:
        raise HTTPException(status_code=404, detail="Food item not found")
    
    # Get all reviews for this food item
    reviews = db.query(models.FoodReview).filter(
        models.FoodReview.food_item_id == food_id
    ).order_by(models.FoodReview.created_at.desc()).all()
    
    # Calculate average rating
    if reviews:
        avg_rating = sum(r.rating for r in reviews) / len(reviews)
    else:
        avg_rating = 0
    
    # Format reviews for response
    reviews_list = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "rating": r.rating,
            "review_text": r.review_text,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in reviews
    ]
    
    return {
        "food_id": food_id,
        "food_name": food_item.name,
        "average_rating": round(avg_rating, 1),
        "total_reviews": len(reviews),
        "reviews": reviews_list
    }

@app.post("/api/reviews")
def submit_review(admission_no: str = Body(...), food_id: int = Body(...), rating: int = Body(...), review_text: str = Body(None), db: Session = Depends(get_db)):
    """Submit a review for a food item"""
    
    # Validate rating
    if not (1 <= rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    # Check if user exists
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if food item exists
    food_item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not food_item:
        raise HTTPException(status_code=404, detail="Food item not found")
    
    # Check if user already reviewed this item
    existing_review = db.query(models.FoodReview).filter(
        models.FoodReview.food_item_id == food_id,
        models.FoodReview.user_id == admission_no
    ).first()
    
    if existing_review:
        # Update existing review
        existing_review.rating = rating
        existing_review.review_text = review_text
        existing_review.created_at = time_logic.get_current_datetime()
        db.commit()
        return {"status": "updated", "message": "Review updated successfully", "review_id": existing_review.id}
    else:
        # Create new review
        new_review = models.FoodReview(
            food_item_id=food_id,
            user_id=admission_no,
            rating=rating,
            review_text=review_text
        )
        db.add(new_review)
        db.commit()
        db.refresh(new_review)
        return {"status": "created", "message": "Review submitted successfully", "review_id": new_review.id}

@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int, admission_no: str = Query(None), db: Session = Depends(get_db)):
    """Delete a review. Owner or admin can delete"""
    
    review = db.query(models.FoodReview).filter(models.FoodReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    # Check permissions - owner or admin can delete
    if admission_no:
        # Check if user is owner or admin
        if admission_no == review.user_id:
            # User is the owner
            pass
        else:
            # Check if user is an admin
            user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
            if not user or user.role != "admin":
                raise HTTPException(status_code=403, detail="Not authorized to delete this review")
    
    db.delete(review)
    db.commit()
    return {"status": "success", "message": "Review deleted successfully"}

# --- PROFIT MANAGEMENT ---

def get_week_start_end(target_date):
    """Get the Monday-Sunday week for a given date"""
    from datetime import datetime, timedelta, date as date_type
    
    # Convert to date object if needed
    if isinstance(target_date, str):
        dt = datetime.strptime(target_date, "%Y-%m-%d").date()
    elif isinstance(target_date, datetime):
        dt = target_date.date()
    else:
        dt = target_date
    
    # Convert to datetime for weekday calculation
    dt_temp = datetime.combine(dt, datetime.min.time())
    monday = dt_temp - timedelta(days=dt_temp.weekday())
    sunday = monday + timedelta(days=6)
    return monday.date(), sunday.date()

def calculate_week_revenue(week_start, week_end, db):
    """Calculate total revenue from collected/completed orders for a week"""
    try:
        total = db.query(
            func.coalesce(func.sum(models.BookedItem.quantity * models.FoodItem.price_full), 0)
        ).select_from(models.Booking).join(
            models.BookedItem, models.BookedItem.booking_id == models.Booking.id
        ).join(
            models.FoodItem, models.FoodItem.id == models.BookedItem.food_item_id
        ).filter(
            models.Booking.booking_date >= week_start,
            models.Booking.booking_date <= week_end,
            models.Booking.status.in_(["collected", "completed"])
        ).scalar()

        return int(total or 0)
    except Exception as e:
        print(f"Error calculating revenue: {e}")
        return 0

@app.get("/api/admin/daily-expenses")
def get_daily_expenses(week_start: date = Query(None), db: Session = Depends(get_db)):
    """Get all daily expenses, optionally filtered by week"""
    try:
        if week_start:
            week_start_date, week_end_date = get_week_start_end(week_start)
            expenses = db.query(models.DailyExpense).filter(
                models.DailyExpense.expense_date >= week_start_date,
                models.DailyExpense.expense_date <= week_end_date
            ).order_by(models.DailyExpense.expense_date).all()
        else:
            expenses = db.query(models.DailyExpense).order_by(models.DailyExpense.expense_date.desc()).all()
        
        return [
            {
                'id': e.id,
                'expense_date': e.expense_date,
                'amount': e.amount,
                'description': e.description,
                'created_at': e.created_at,
                'updated_at': e.updated_at
            }
            for e in expenses
        ]
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/daily-expenses")
def add_or_update_daily_expense(expense_date: date = Body(...), amount: int = Body(...), description: str = Body(None), db: Session = Depends(get_db)):
    """Add or update a daily expense"""
    try:
        existing = db.query(models.DailyExpense).filter(
            models.DailyExpense.expense_date == expense_date
        ).first()
        
        if existing:
            existing.amount = amount
            existing.description = description
            existing.updated_at = time_logic.get_current_datetime()
            db.commit()
            action = "updated"
        else:
            new_expense = models.DailyExpense(
                expense_date=expense_date,
                amount=amount,
                description=description
            )
            db.add(new_expense)
            db.commit()
            action = "created"
        
        return {"status": action, "message": f"Expense {action} successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/weekly-profit")
def get_weekly_profit(week_start: date = Query(None), db: Session = Depends(get_db)):
    """Get profit data for a specific week and recalculate if needed"""
    try:
        if not week_start:
            week_start = time_logic.get_current_date()
        
        week_start_date, week_end_date = get_week_start_end(week_start)
        
        # Calculate revenue from completed orders
        revenue = calculate_week_revenue(week_start_date, week_end_date, db)
        
        # Get total expenses for the week
        expenses = db.query(models.DailyExpense).filter(
            models.DailyExpense.expense_date >= week_start_date,
            models.DailyExpense.expense_date <= week_end_date
        ).all()
        
        total_expenses = sum(e.amount for e in expenses)
        net_profit = revenue - total_expenses
        
        # Get or create weekly profit record
        weekly_record = db.query(models.WeeklyProfit).filter(
            models.WeeklyProfit.week_start_date == week_start_date
        ).first()
        
        if weekly_record:
            weekly_record.total_revenue = revenue
            weekly_record.total_expenses = total_expenses
            weekly_record.net_profit = net_profit
            weekly_record.updated_at = time_logic.get_current_datetime()
            db.commit()
        else:
            weekly_record = models.WeeklyProfit(
                week_start_date=week_start_date,
                week_end_date=week_end_date,
                total_revenue=revenue,
                total_expenses=total_expenses,
                net_profit=net_profit
            )
            db.add(weekly_record)
            db.commit()
        
        # Get daily expenses for frontend
        daily_expenses = [
            {
                'expense_date': str(e.expense_date),
                'amount': e.amount,
                'description': e.description
            }
            for e in expenses
        ]
        
        return {
            "week_start_date": str(week_start_date),
            "week_end_date": str(week_end_date),
            "total_revenue": revenue,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "daily_expenses": daily_expenses
        }
    except Exception as e:
        import traceback
        print(f"Error in get_weekly_profit: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/monthly-profit")
def get_monthly_profit(year: int = Query(None), month: int = Query(None), db: Session = Depends(get_db)):
    """Get profit data for all weeks in a month"""
    try:
        from datetime import timedelta
        if not year or not month:
            today = time_logic.get_current_date()
            year = today.year
            month = today.month
        
        # Calculate month boundaries properly
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        
        # Build all unique weeks that overlap the selected month
        overlap_week_starts = []
        cursor = start_date
        while cursor < end_date:
            week_start, _ = get_week_start_end(cursor)
            if week_start not in overlap_week_starts:
                overlap_week_starts.append(week_start)
            cursor += timedelta(days=1)

        weeks_payload = []
        for week_start_date in overlap_week_starts:
            week_end_date = week_start_date + timedelta(days=6)

            revenue = calculate_week_revenue(week_start_date, week_end_date, db)
            expenses = db.query(func.coalesce(func.sum(models.DailyExpense.amount), 0)).filter(
                models.DailyExpense.expense_date >= week_start_date,
                models.DailyExpense.expense_date <= week_end_date
            ).scalar() or 0
            expenses = int(expenses)
            profit = revenue - expenses

            # Persist/update weekly snapshot for consistency with weekly view
            weekly_record = db.query(models.WeeklyProfit).filter(
                models.WeeklyProfit.week_start_date == week_start_date
            ).first()
            if weekly_record:
                weekly_record.week_end_date = week_end_date
                weekly_record.total_revenue = revenue
                weekly_record.total_expenses = expenses
                weekly_record.net_profit = profit
                weekly_record.updated_at = time_logic.get_current_datetime()
            else:
                db.add(models.WeeklyProfit(
                    week_start_date=week_start_date,
                    week_end_date=week_end_date,
                    total_revenue=revenue,
                    total_expenses=expenses,
                    net_profit=profit
                ))

            # Include only weeks that actually have some data
            if revenue > 0 or expenses > 0:
                weeks_payload.append({
                    'week_start': str(week_start_date),
                    'week_end': str(week_end_date),
                    'revenue': revenue,
                    'expenses': expenses,
                    'profit': profit
                })

        db.commit()
        
        return {
            "year": year,
            "month": month,
            "weeks": weeks_payload
        }
    except Exception as e:
        import traceback
        print(f"Error in get_monthly_profit: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/admin/daily-expenses/{expense_id}")
def delete_daily_expense(expense_id: int, db: Session = Depends(get_db)):
    """Delete a daily expense"""
    try:
        expense = db.query(models.DailyExpense).filter(models.DailyExpense.id == expense_id).first()
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        db.delete(expense)
        db.commit()
        return {"status": "success", "message": "Expense deleted successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# USER FEEDBACK & NOTIFICATIONS
# ==========================================

@app.post("/api/feedback")
def create_feedback(payload: schemas.FeedbackCreate, db: Session = Depends(get_db)):
    category = (payload.category or "").strip().lower()
    if category not in {"suggestion", "complaint"}:
        raise HTTPException(status_code=400, detail="Category must be suggestion or complaint")

    user = db.query(models.User).filter(models.User.admission_no == payload.admission_no).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    subject = (payload.subject or "").strip()
    message = (payload.message or "").strip()
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message are required")

    row = models.SystemFeedback(
        user_id=payload.admission_no,
        category=category,
        subject=subject,
        message=message,
        status="open"
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": row.id}


@app.get("/api/feedback/me/{admission_no}")
def get_my_feedback(admission_no: str, db: Session = Depends(get_db)):
    rows = db.query(models.SystemFeedback).filter(
        models.SystemFeedback.user_id == admission_no
    ).order_by(models.SystemFeedback.created_at.desc()).all()

    return [
        {
            "id": r.id,
            "category": r.category,
            "subject": r.subject,
            "message": r.message,
            "status": r.status,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@app.get("/api/admin/feedback")
def get_all_feedback(db: Session = Depends(get_db)):
    rows = db.query(models.SystemFeedback).order_by(models.SystemFeedback.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "category": r.category,
            "subject": r.subject,
            "message": r.message,
            "status": r.status,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@app.patch("/api/admin/feedback/{feedback_id}")
def update_feedback_status(feedback_id: int, payload: schemas.FeedbackStatusUpdate, db: Session = Depends(get_db)):
    row = db.query(models.SystemFeedback).filter(models.SystemFeedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")

    next_status = (payload.status or "").strip().lower()
    if next_status not in {"open", "in_review", "resolved"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    row.status = next_status
    db.commit()
    return {"status": "success"}


@app.post("/api/admin/notifications")
def create_notification(payload: schemas.NotificationCreate, db: Session = Depends(get_db)):
    target = (payload.target or "global").strip().lower()
    if target not in {"global", "personal"}:
        raise HTTPException(status_code=400, detail="target must be global or personal")

    title = (payload.title or "").strip()
    message = (payload.message or "").strip()
    if not title or not message:
        raise HTTPException(status_code=400, detail="Title and message are required")

    target_user = None
    if target == "personal":
        target_user = (payload.user_id or "").strip()
        if not target_user:
            raise HTTPException(status_code=400, detail="user_id is required for personal notifications")
        user = db.query(models.User).filter(models.User.admission_no == target_user).first()
        if not user:
            raise HTTPException(status_code=404, detail="Target user not found")

    row = models.Notification(
        title=title,
        message=message,
        user_id=target_user,
        created_by=(payload.created_by or "").strip() or None
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": row.id}


@app.get("/api/admin/notifications")
def get_all_notifications(db: Session = Depends(get_db)):
    rows = db.query(models.Notification).order_by(models.Notification.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "message": r.message,
            "user_id": r.user_id,
            "created_by": r.created_by,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@app.get("/api/notifications/{admission_no}")
def get_user_notifications(admission_no: str, db: Session = Depends(get_db)):
    rows = db.query(models.Notification).filter(
        (models.Notification.user_id == None) | (models.Notification.user_id == admission_no)
    ).order_by(models.Notification.created_at.desc()).all()

    notifications = [
        {
            "id": r.id,
            "type": "admin",
            "title": r.title,
            "message": r.message,
            "target": "global" if r.user_id is None else "personal",
            "created_at": r.created_at,
        }
        for r in rows
    ]

    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if user:
        flags = user.flags or 0
        if flags > 0:
            notifications.insert(0, {
                "id": f"flag-{admission_no}",
                "type": "flag",
                "title": "Flag Update",
                "message": f"You currently have {flags} flag(s). Reach out to admin if this seems incorrect.",
                "target": "personal",
                "created_at": user.flagged_at,
            })

    return notifications
