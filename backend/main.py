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