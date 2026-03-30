import os
import sys
from sqlalchemy.orm import sessionmaker

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from backend.database import engine
from backend.models import FoodItem

def seed_menu():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        print("--- STARTING MENU DATA SEED ---")
        
        seed_data = [
            # Breakfast
            {"name": "Puttu", "price_full": 40, "price_half": 20, "has_portions": True, "is_countable": False, "category": "meal", "meal_type": "breakfast", "description": "Traditional steamed rice cake."},
            {"name": "Uppumav", "price_full": 30, "price_half": 0, "has_portions": False, "is_countable": False, "category": "meal", "meal_type": "breakfast", "description": "Savory semolina porridge."},
            {"name": "Idiyappam", "price_full": 10, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "breakfast", "description": "String hoppers made from rice flour."},
            {"name": "Dosa", "price_full": 12, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "breakfast", "description": "Crispy rice crepe. Served with chutney."},
            {"name": "Idli", "price_full": 10, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "breakfast", "description": "Soft steamed rice cakes. Served with chutney."},
            {"name": "Poori", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "breakfast", "description": "Deep-fried bread. Served with potato bhaji."},
            {"name": "Chapati", "price_full": 12, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "breakfast", "description": "Soft whole wheat flatbread."},
            {"name": "Ney Pathal", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "breakfast", "description": "Deep-fried rice flour bread."},
            {"name": "Kadala Curry", "price_full": 25, "price_half": 0, "has_portions": False, "is_countable": False, "category": "curry", "meal_type": "breakfast", "description": "Spicy black chickpea curry."},
            {"name": "Egg Curry", "price_full": 30, "price_half": 15, "has_portions": True, "is_countable": False, "category": "curry", "meal_type": "breakfast", "description": "Boiled eggs in a rich, spiced gravy."},
            {"name": "Sambar", "price_full": 0, "price_half": 0, "has_portions": False, "is_countable": False, "category": "curry", "meal_type": "breakfast", "description": "Lentil-based vegetable stew."},
            
            # Lunch
            {"name": "Chicken Biryani", "price_full": 120, "price_half": 70, "has_portions": True, "is_countable": False, "category": "meal", "meal_type": "lunch", "description": "Aromatic basmati rice cooked with spiced chicken."},
            {"name": "Veg Biryani", "price_full": 80, "price_half": 45, "has_portions": True, "is_countable": False, "category": "meal", "meal_type": "lunch", "description": "Fragrant rice dish mixed with mixed vegetables."},
            {"name": "Egg Biryani", "price_full": 90, "price_half": 50, "has_portions": True, "is_countable": False, "category": "meal", "meal_type": "lunch", "description": "Spiced rice cooked with boiled eggs."},
            {"name": "Porotta", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "meal", "meal_type": "lunch", "description": "Flaky, layered flatbread."},
            {"name": "Oonu", "price_full": 50, "price_half": 0, "has_portions": False, "is_countable": False, "category": "meal", "meal_type": "lunch", "description": "Traditional Kerala meals served with rice and curries."},
            {"name": "Neychor", "price_full": 70, "price_half": 40, "has_portions": True, "is_countable": False, "category": "meal", "meal_type": "lunch", "description": "Flavorful ghee rice."},
            {"name": "Chicken Fry", "price_full": 80, "price_half": 45, "has_portions": True, "is_countable": False, "category": "side", "meal_type": "lunch", "description": "Crispy marinated fried chicken pieces."},
            {"name": "Chicken Curry", "price_full": 80, "price_half": 45, "has_portions": True, "is_countable": False, "category": "curry", "meal_type": "lunch", "description": "Chicken cooked in a rich, spicy gravy."},
            {"name": "Fish Curry", "price_full": 70, "price_half": 40, "has_portions": True, "is_countable": False, "category": "curry", "meal_type": "lunch", "description": "Tangy and spicy fish curry."},
            {"name": "Fish Fry", "price_full": 80, "price_half": 45, "has_portions": True, "is_countable": False, "category": "side", "meal_type": "lunch", "description": "Marinated fish shallow fried to perfection."},
            {"name": "Omelette", "price_full": 20, "price_half": 0, "has_portions": False, "is_countable": False, "category": "side", "meal_type": "lunch", "description": "Double egg omelette with onions and chilies."},
            {"name": "Pappadam", "price_full": 10, "price_half": 0, "has_portions": False, "is_countable": False, "category": "side", "meal_type": "lunch", "description": "Crispy lentil wafer."},
            {"name": "Thoran", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": False, "category": "side", "meal_type": "lunch", "description": "Dry vegetable dish with grated coconut."},
            {"name": "Soybean Fry", "price_full": 30, "price_half": 0, "has_portions": False, "is_countable": False, "category": "side", "meal_type": "lunch", "description": "Spicy roasted soybean chunks."},
            
            # Snacks
            {"name": "Cutlet", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Crispy vegetable or meat cutlet."},
            {"name": "Puffs", "price_full": 20, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Flaky pastry stuffed with savory filling."},
            {"name": "Samosa", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Triangular pastry with spiced potato filling."},
            {"name": "Chicken Roll", "price_full": 25, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Spicy chicken wrapped in a soft roll."},
            {"name": "Sandwich", "price_full": 30, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Freshly prepared sandwich."},
            {"name": "Kalmas", "price_full": 20, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Traditional Malabar snack."},
            {"name": "Pazham Pori", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Sweet banana fritters."},
            {"name": "Kaya Pori", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Crispy raw banana fritters."},
            {"name": "Bread Pori", "price_full": 15, "price_half": 0, "has_portions": False, "is_countable": True, "category": "snack", "meal_type": "snack", "description": "Fried bread snack."},
            
            # Drinks
            {"name": "Lime Juice", "price_full": 20, "price_half": 0, "has_portions": False, "is_countable": True, "category": "drink", "meal_type": "snack", "description": "Refreshing fresh lime juice."},
            {"name": "Watermelon Juice", "price_full": 25, "price_half": 0, "has_portions": False, "is_countable": True, "category": "drink", "meal_type": "snack", "description": "Freshly squeezed watermelon juice."},
            {"name": "Grape Juice", "price_full": 30, "price_half": 0, "has_portions": False, "is_countable": True, "category": "drink", "meal_type": "snack", "description": "Sweet grape juice."}
        ]

        existing_items = {item[0] for item in db.query(FoodItem.name).all()}
        added_count = 0
        
        for item_data in seed_data:
            if item_data["name"] not in existing_items:
                new_item = FoodItem(**item_data)
                db.add(new_item)
                added_count += 1
        
        db.commit()
        print(f"✅ SUCCESS: Added {added_count} new menu items!")
            
    except Exception as e:
        print(f"❌ SEEDING FAILED: {e}")
        db.rollback()
    finally:
        db.close()
        print("--- SEEDING COMPLETE ---")

if __name__ == "__main__":
    seed_menu()
