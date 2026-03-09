print("--- SCRIPT STARTED ---")
from backend.database import engine, Base
from backend.models import User, FoodItem, Booking, Seat # Now this will work!

def create_tables():
    print("--- ATTEMPTING CONNECTION ---")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ SUCCESS: Tables created in Supabase!")
    except Exception as e:
        print(f"❌ CONNECTION FAILED: {e}")

def create_seats():
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        # Create seats: 5 tables, 4 seats each
        for table in range(1, 6):
            for seat in range(1, 5):
                new_seat = Seat(table_number=table, seat_number=seat)
                db.add(new_seat)
        db.commit()
        print("✅ SUCCESS: Seats created!")
    except Exception as e:
        print(f"❌ SEAT CREATION FAILED: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_tables()
    create_seats()