print("--- SCRIPT STARTED ---")
from backend.database import engine, Base
from backend.models import User, FoodItem, Booking, Seat, Holiday # Now this will work!

def create_tables():
    print("--- ATTEMPTING CONNECTION ---")
    try:
        # Drop all tables first to ensure a clean slate
        print("--- DROPPING ALL TABLES (DISABLED) ---")
        # Base.metadata.drop_all(bind=engine) # DANGEROUS: Wipes all data! Commented out for safety.
        print("--- CREATING ALL TABLES ---")
        Base.metadata.create_all(bind=engine)
        print("✅ SUCCESS: Tables verified/created in Supabase!")
    except Exception as e:
        print(f"❌ CONNECTION FAILED: {e}")

def create_seats():
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        if db.query(Seat).count() == 0:
            # Create student seats (e.g., 20 seats)
            for i in range(1, 21):
                table_num = (i - 1) // 4 + 1
                seat_num = (i - 1) % 4 + 1
                db.add(Seat(table_number=table_num, seat_number=seat_num, section='student'))

            # Create staff seats (e.g., 20 seats)
            for i in range(1, 21):
                table_num = (i - 1) // 4 + 1
                seat_num = (i - 1) % 4 + 1
                db.add(Seat(table_number=table_num, seat_number=seat_num, section='staff'))

            db.commit()
            print("✅ SUCCESS: Seats created!")
        else:
            print("ℹ️ Seats already exist. Skipping seat creation.")
    except Exception as e:
        print(f"❌ SEAT CREATION FAILED: {e}")
        db.rollback()
    finally:
        db.close()

def seed_food_items():
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        if db.query(FoodItem).count() == 0:
            foods = [
                FoodItem(name="Appam", price_full=10, category="meal", meal_type="breakfast", is_countable=True, has_portions=False),
                FoodItem(name="Idiyappam", price_full=10, category="meal", meal_type="breakfast", is_countable=True, has_portions=False),
                FoodItem(name="Chicken Curry", price_full=50, price_half=30, category="curry", meal_type="breakfast", is_countable=False, has_portions=True),
                FoodItem(name="Veg Stew", price_full=30, category="curry", meal_type="breakfast", is_countable=False, has_portions=False),
                FoodItem(name="Chicken Biriyani", price_full=100, price_half=60, category="meal", meal_type="lunch", is_countable=False, has_portions=True),
                FoodItem(name="Meals", price_full=50, category="meal", meal_type="lunch", is_countable=False, has_portions=False),
                FoodItem(name="Fish Fry", price_full=40, category="side", meal_type="lunch", is_countable=False, has_portions=False),
                FoodItem(name="Pazhampori", price_full=15, category="snack", meal_type="snack", is_walkin_only=True, is_countable=True, has_portions=False)
            ]
            db.add_all(foods)
            db.commit()
            print("✅ SUCCESS: Food items seeded!")
        else:
            print("ℹ️ Food items already exist. Skipping food seed.")
    except Exception as e:
        print(f"❌ FOOD SEEDING FAILED: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_tables()
    create_seats()
    seed_food_items()