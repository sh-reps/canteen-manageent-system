from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from . import models, schema # Importing your new files
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    # THE 10:00 AM RULE
    import datetime
    now = datetime.datetime.now().time()
    cutoff = datetime.time(10, 0, 0)
    
    if now > cutoff:
        raise HTTPException(status_code=400, detail="Same-day bookings closed after 10:00 AM")
    #boooking
    new_booking = models.Booking(
        user_id=booking.admission_no, 
        item_id=booking.item_id,
        scheduled_slot=booking.scheduled_slot,
        order_type=booking.order_type
    )
    db.add(new_booking)
    db.commit()
    return {"message": "Booking successful!"}

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