from fastapi import APIRouter, FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from typing import List
from datetime import date



# Import your local files
from . import models, schemas, database
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

# ==========================================
# 1. MENU & SEAT FETCHING ENDPOINTS
# ==========================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"VALIDATION ERROR: {exc.errors()}") # This shows the exact field failing in your terminal
    return JSONResponse(status_code=400, content={"detail": exc.errors()})

# Add this to your backend/main.py

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # This prints the SPECIFIC reason for the 400 error in your terminal
    print(f"❌ VALIDATION ERROR: {exc.errors()}") 
    return JSONResponse(
        status_code=400,
        content={"detail": exc.errors(), "body": exc.body}
    )



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
    print(f"DEBUG: Incoming booking data -> {booking_data}")
    
    # 2. Find the User using 'admission_no' (NOT 'id')
    user = db.query(models.User).filter(
        models.User.admission_no == booking_data.admission_no
    ).first()
    
    if not user:
        print(f"❌ ERROR: User {booking_data.admission_no} not found")
        raise HTTPException(status_code=404, detail="User not found")

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

@app.post("/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.admission_no == user_data.admission_no,
        models.User.password == user_data.password
    ).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
        
    return {"message": "Success", "admission_no": user.admission_no}