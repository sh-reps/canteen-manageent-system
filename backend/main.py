from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from . import models
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Enable CORS so your frontend can talk to your backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/login")
def login(admission_no: str, password: str, db: Session = Depends(get_db)):
    # Look for the student by their unique Admission Number
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    
    if not user or user.password != password:
        raise HTTPException(status_code=401, detail="Invalid Admission Number or Password")
    
    return {"message": "Login Successful", "role": user.role, "admission_no": user.admission_no}