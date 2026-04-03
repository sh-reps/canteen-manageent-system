import os
import sys
import bcrypt
from sqlalchemy.orm import sessionmaker

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from backend.database import engine
from backend.models import User

def seed_test_users():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    def hash_pw(password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    try:
        print("--- STARTING TEST DATA SEED ---")
        users_to_add = []
        
        # Fetch existing admission numbers to completely avoid duplicate errors
        existing_users = {u[0] for u in db.query(User.admission_no).all()}
        
        # 1. Admin
        if "admin" not in existing_users:
            users_to_add.append(User(admission_no="admin", password=hash_pw("admin123"), role="admin"))
            
        # 2. Students (student1 to student50)
        student_pw = hash_pw("student123")
        for i in range(1, 51):
            adm_no = f"student{i}"
            if adm_no not in existing_users:
                users_to_add.append(User(admission_no=adm_no, password=student_pw, role="student"))
                
        # 3. Staff (staff1 to staff20)
        staff_pw = hash_pw("staff123")
        for i in range(1, 21):
            adm_no = f"staff{i}"
            if adm_no not in existing_users:
                users_to_add.append(User(admission_no=adm_no, password=staff_pw, role="staff"))
        
        if users_to_add:
            db.add_all(users_to_add)
            db.commit()
            print(f"✅ SUCCESS: Added {len(users_to_add)} new test users!")
        else:
            print("ℹ️ All test users already exist. No new users needed.")
            
    except Exception as e:
        print(f"❌ SEEDING FAILED: {e}")
        db.rollback()
    finally:
        db.close()
        print("--- SEEDING COMPLETE ---")

if __name__ == "__main__":
    seed_test_users()