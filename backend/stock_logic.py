from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models
from .time_logic import get_current_date

# Track if 1am/7am logic has run for today
import datetime

def process_1am_lunch_recalc(db: Session):
    """
    Recalculates lunch stock based on pre-orders before 1 AM.
    New Total Stock = (Pre-order Count) + 20% Buffer.
    The buffer is split: 10% for late pre-booking, 10% for walk-in.
    """
    print("Executing 1 AM lunch recalculation...")
    lunch_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'lunch').all()
    today = get_current_date()
    day_of_week = today.strftime('%A').lower()

    # Mark logic as run for today in the database
    db.add(models.LogicRun(logic_name='lunch_1am', last_run_date=today))

    for item in lunch_items:
        # Get the stock record for today to update it
        stock = get_or_create_stock(db, item.id, day_of_week)

        # The base stock is now a live counter. We just read it.
        pre_order_count = stock.admin_base_stock
        print(f"Item '{item.name}' (ID: {item.id}) has {pre_order_count} pre-orders.")
        # Calculate the 20% buffer based on pre-orders
        buffer = int(pre_order_count * 0.20)
        # Buffer split: 10% for late pre-book (1am-11am), 10% for walk-in
        prebook_buffer = buffer // 2
        walkin_buffer = buffer - prebook_buffer

        # Update the buffer pools based on the live base stock count
        stock.prebook_pool = prebook_buffer
        stock.walkin_pool = walkin_buffer
        print(f"Updated '{item.name}': Base={stock.admin_base_stock}, Pre-book Buffer={stock.prebook_pool}, Walk-in Buffer={stock.walkin_pool}")

    db.commit()
    print("1 AM lunch recalculation complete.")

# Helper: get or create FoodStock for a food item and day
def get_or_create_stock(db, food_item_id, day_of_week):
    from .models import FoodStock, FoodItem
    stock = db.query(FoodStock).filter_by(food_item_id=food_item_id, day_of_week=day_of_week).first()
    if not stock:
        # If no stock record for the day, create one from the item's template values
        item_template = db.query(FoodItem).filter_by(id=food_item_id).first()
        stock = FoodStock(
            food_item_id=food_item_id,
            day_of_week=day_of_week,
            admin_base_stock=item_template.admin_base_stock if item_template else 0,
            prebook_pool=0,  # Pools start at 0 until calculated
            walkin_pool=0,
            breakfast_buffer=item_template.breakfast_buffer if item_template else 0
        )
        db.add(stock)
        db.commit() # Commit immediately to avoid race conditions
        db.refresh(stock)
    return stock

def get_all_food_items(db: Session, day=None):
    # Return all food items with their stock for the given day (default: today)
    from .models import FoodItem, FoodStock
    items = db.query(FoodItem).all()
    if not day:
        day = get_current_date().strftime('%A').lower()
    result = []
    for item in items:
        stock = db.query(FoodStock).filter_by(food_item_id=item.id, day_of_week=day).first()
        stock_dict = {
            'admin_base_stock': stock.admin_base_stock if stock else 0,
            'prebook_pool': stock.prebook_pool if stock else 0,
            'walkin_pool': stock.walkin_pool if stock else 0,
            'breakfast_buffer': stock.breakfast_buffer if stock else 0,
        }
        item_dict = item.as_dict() if hasattr(item, 'as_dict') else {c.name: getattr(item, c.name) for c in item.__table__.columns}
        item_dict.update(stock_dict)
        result.append(item_dict)
    return result

def process_5pm_breakfast_recalc(db: Session):
    """
    Recalculates breakfast stock based on pre-orders before 5 PM the day prior.
    New Total Stock = (Pre-order Count) + 20% Buffer.
    The buffer is split: 10% for late pre-booking (5pm-7am), 10% for walk-in.
    """
    print("Executing 5 PM breakfast recalculation for tomorrow...")
    breakfast_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'breakfast').all()
    today = get_current_date()
    target_date = today + datetime.timedelta(days=1)
    day_of_week = target_date.strftime('%A').lower()

    db.add(models.LogicRun(logic_name='breakfast_5pm', last_run_date=today))

    for item in breakfast_items:
        stock = get_or_create_stock(db, item.id, day_of_week)

        # The base stock is now a live counter. We just read it.
        pre_order_count = stock.admin_base_stock
        print(f"Item '{item.name}' (ID: {item.id}) has {pre_order_count} pre-orders for tomorrow.")

        buffer = int(pre_order_count * 0.20)
        prebook_buffer = buffer // 2
        walkin_buffer = buffer - prebook_buffer

        stock.prebook_pool = prebook_buffer
        stock.walkin_pool = walkin_buffer
        print(f"Updated '{item.name}': Base={stock.admin_base_stock}, Pre-book Pool={stock.prebook_pool}, Walk-in Pool={stock.walkin_pool}")

    db.commit()
    print("5 PM breakfast recalculation complete.")

def process_7am_breakfast_rollover(db: Session):
    """
    Handles the 7 AM logic for breakfast items.
    - All remaining (unbooked) prebook items are moved to the walk-in pool.
    """
    print("Executing 7 AM breakfast rollover...")
    breakfast_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'breakfast').all()
    today = get_current_date()
    day_of_week = today.strftime('%A').lower()

    # Mark logic as run for today in the database
    db.add(models.LogicRun(logic_name='breakfast_7am', last_run_date=today))

    for item in breakfast_items:
        stock = get_or_create_stock(db, item.id, day_of_week)
        # At 7 AM, all unbooked pre-book items move to walk-in.
        print(f"Item '{item.name}' (ID: {item.id}): Moving {stock.prebook_pool} pre-book items to walk-in.")

        stock.walkin_pool += stock.prebook_pool
        stock.prebook_pool = 0

        print(f"Updated '{item.name}': Pre-book Pool={stock.prebook_pool}, Walk-in Pool={stock.walkin_pool}")
    db.commit()
    print("7 AM breakfast rollover complete.")


def process_11am_lunch_rollover(db: Session):
    """
    Moves any remaining pre-book items for lunch to the walk-in pool.
    """
    print("Executing 11 AM lunch rollover...")
    lunch_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'lunch').all()
    today = get_current_date()
    day_of_week = today.strftime('%A').lower()

    # Mark logic as run for today
    db.add(models.LogicRun(logic_name='lunch_11am', last_run_date=today))

    for item in lunch_items:
        stock = get_or_create_stock(db, item.id, day_of_week)
        print(f"Item '{item.name}' (ID: {item.id}): Moving {stock.prebook_pool} items from pre-book buffer to walk-in.")
        stock.walkin_pool += stock.prebook_pool
        stock.prebook_pool = 0
        print(f"Updated '{item.name}': Pre-book Pool={stock.prebook_pool}, Walk-in Pool={stock.walkin_pool}")

    db.commit()
    print("11 AM lunch rollover complete.")


# A data structure to define our time-based triggers in a clear, extensible way.
# Format: (Hour to run after, Name in LogicRun table, Function to execute)
TIME_TRIGGERS = [
    (1, 'lunch_1am', process_1am_lunch_recalc),
    (7, 'breakfast_7am', process_7am_breakfast_rollover),
    (11, 'lunch_11am', process_11am_lunch_rollover),
    (17, 'breakfast_5pm', process_5pm_breakfast_recalc),
]

def is_working_day(target_date: datetime.date, db: Session) -> bool:
    """Check if a date is a working day (not a weekend and not a holiday)."""
    if target_date.weekday() >= 5:  # 5 = Saturday, 6 = Sunday
        return False
    holiday = db.query(models.Holiday).filter(models.Holiday.date == target_date).first()
    if holiday:
        return False
    return True

def evaluate_time_triggers(db: Session):
    """
    Evaluates the current mocked time and triggers any pending stock logic.
    This function is designed to be idempotent and safe to call frequently.
    """
    from . import time_logic
    now = time_logic.get_current_datetime()
    today_date = now.date()
    tomorrow_date = today_date + datetime.timedelta(days=1)
    
    today_working = is_working_day(today_date, db)
    tomorrow_working = is_working_day(tomorrow_date, db)
    
    # Get the set of logic that has already run today from the database.
    runs_today = {run.logic_name for run in db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today_date).all()}

    # Loop through our defined triggers
    for hour, name, func in TIME_TRIGGERS:
        # On non-working days, only allow the 5 PM breakfast recalc if tomorrow is a working day
        if not today_working and (name != 'breakfast_5pm' or not tomorrow_working):
            continue
        # On working days, prevent the 5 PM breakfast recalc if tomorrow is NOT a working day
        if today_working and name == 'breakfast_5pm' and not tomorrow_working:
            continue
            
        if now.hour >= hour and name not in runs_today:
            func(db)
            runs_today.add(name) # Add to set to prevent re-running in this same call if time changes mid-function