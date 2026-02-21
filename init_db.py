print("--- SCRIPT STARTED ---")
from backend.database import engine, Base
from backend.models import User, FoodItem, Booking # Now this will work!

def create_tables():
    print("--- ATTEMPTING CONNECTION ---")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ SUCCESS: Tables created in Supabase!")
    except Exception as e:
        print(f"❌ CONNECTION FAILED: {e}")

if __name__ == "__main__":
    create_tables()