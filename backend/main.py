from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from . import models, schema 
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/login", response_model=schema.LoginResponse) # Using your schema
def login(user_data: schema.LoginRequest, db: Session = Depends(get_db)):
    # Look for the user in the database
    user = db.query(models.User).filter(
        models.User.admission_no == user_data.admission_no
    ).first()
    
    # Check if user exists and password matches
    if not user or user.password != user_data.password:
        raise HTTPException(status_code=401, detail="Invalid Admission Number or Password")
    
    return {
        "admission_no": user.admission_no, 
        "role": user.role, 
        "message": "Login successful"
    }

@app.get("/menu")
def get_menu(db: Session = Depends(get_db)):
    # Fetch all items from the food_items table
    items = db.query(models.FoodItem).all()
    return items

@app.post("/book")
def create_booking(booking: schema.BookingCreate, db: Session = Depends(get_db)):
    #  Check the 10:00 AM Deadline
    now_time = datetime.now().time()
    deadline = time(23, 0, 0)
    
    if now_time > deadline:
        raise HTTPException(
            status_code=400, 
            detail="Same-day bookings are closed. Please book before 10:00 AM."
        )

    # Check if stock is available
    item = db.query(models.FoodItem).filter(models.FoodItem.id == booking.item_id).first()
    if item.base_stock <= 0:
        raise HTTPException(status_code=400, detail="Item out of stock!")

    if booking.order_type == "sit-in":
        # Check if this exact seat is already taken for this time slot
        is_taken = db.query(models.Booking).filter(
            models.Booking.seat_id == booking.seat_id,
            models.Booking.scheduled_slot == booking.scheduled_slot,
            models.Booking.status == "active"
        ).first()

        if is_taken:
            raise HTTPException(status_code=400, detail="This seat is already reserved for this time.")

    new_booking = models.Booking(
        user_id=booking.admission_no,
        item_id=booking.item_id,
        scheduled_slot=booking.scheduled_slot,
        order_type=booking.order_type,
        seat_id=booking.seat_id if booking.order_type == "sit-in" else None
    )
    
    db.add(new_booking)
    db.commit()
    return {"message": "Success! Seat reserved."}

    
    
    # 4. Reduce base stock
    item.base_stock -= 1
    
    db.add(new_booking)
    db.commit()
    return {"message": "Order placed successfully!"}

@app.post("/register", response_model=schema.UserResponse)
def register_user(user: schema.UserCreate, db: Session = Depends(get_db)):
    #Check if the Admission Number already exists
    db_user = db.query(models.User).filter(models.User.admission_no == user.admission_no).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Admission Number already registered")

    # Create the new user object
    new_user = models.User(
        admission_no=user.admission_no,
        password=user.password, # Note: In a real app, you'd hash this!
        role=user.role
    )

    # Save to Supabase
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/book-multiple")
def create_multiple_bookings(data: schema.MultiBookingCreate, db: Session = Depends(get_db)):
    # 1. Calculate allowed meals based on seats picked
    if data.order_type == "sit-in":
        allowed_meals = len(data.seat_ids)
        if allowed_meals == 0:
            raise HTTPException(status_code=400, detail="Please select at least one seat for sit-in.")
    else:
        allowed_meals = 4 # Default limit for take-away

    # 2. Count main meals in the cart
    main_meals_count = 0
    for i_id in data.item_ids:
        item = db.query(models.FoodItem).filter(models.FoodItem.id == i_id).first()
        if item.category in ['meal', 'scalable']:
            main_meals_count += 1

    # 3. Constraint Check
    if main_meals_count > allowed_meals:
        raise HTTPException(
            status_code=400, 
            detail=f"You reserved {allowed_meals} seat(s) but ordered {main_meals_count} meals."
        )

    # 4. Save Bookings (Loop through items, and assign seats)
    # Note: For simplicity, we assign the first seat_id to the first meal, etc.
    for index, i_id in enumerate(data.item_ids):
        # Logic to spread items across the selected seats
        assigned_seat = data.seat_ids[index] if index < len(data.seat_ids) else data.seat_ids[0]
        
        new_booking = models.Booking(
            user_id=data.admission_no,
            item_id=i_id,
            scheduled_slot=data.scheduled_slot,
            order_type=data.order_type,
            seat_id=assigned_seat if data.order_type == "sit-in" else None
        )
        db.add(new_booking)
    
    db.commit()
    return {"message": f"Successfully booked for {allowed_meals} people!"}

@app.get("/available-seats/{slot}")
def get_available_seats(slot: str, db: Session = Depends(get_db)):
    # 1. Fetch all seats (the 4 seats per table we created)
    all_seats = db.query(models.CanteenSeat).all()
    
    # 2. Find which ones are already booked for this specific time
    occupied_seat_ids = db.query(models.Booking.seat_id).filter(
        models.Booking.scheduled_slot == slot,
        models.Booking.status == "active"
    ).all()
    
    # Flatten list: [(1,), (2,)] -> [1, 2]
    occupied_list = [s[0] for s in occupied_seat_ids]

    # 3. Return the status of every seat
    return [
        {
            "id": seat.id,
            "table_number": seat.table_number,
            "seat_number": seat.seat_number,
            "is_occupied": seat.id in occupied_list
        } for seat in all_seats
    ]
