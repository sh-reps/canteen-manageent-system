# Return the current logic status for lunch_1am and breakfast_7am
def logic_status_for_today():
    return logic_status
from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models
from .time_logic import get_current_date

# Track if 1am/7am logic has run for today
import datetime
logic_status = {
    'lunch_1am': None,      # date when 1am lunch logic last ran
    'breakfast_5pm': None,  # date when 5pm breakfast logic last ran
    'breakfast_7am': None,  # date when 7am breakfast logic last ran
}

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

    # Mark logic as run for today
    logic_status['lunch_1am'] = today
    # Mark logic as run for today in the database
    logic_run = db.query(models.LogicRun).filter(models.LogicRun.logic_name == 'lunch_1am').first()
    if logic_run:
        logic_run.last_run_date = today
    else:
        db.add(models.LogicRun(logic_name='lunch_1am', last_run_date=today))

    for item in lunch_items:
        # Get the stock record for today to update it
        stock = get_or_create_stock(db, item.id, day_of_week)

        # Sum the exact quantity of confirmed pre-orders for today
        total_qty = db.query(func.sum(models.BookedItem.quantity)).join(models.Booking).filter(
            models.BookedItem.food_item_id == item.id,
            models.Booking.booking_date == today,
            models.Booking.status == 'confirmed'
        ).scalar()
        pre_order_count = total_qty if total_qty is not None else 0

        print(f"Item '{item.name}' (ID: {item.id}) has {pre_order_count} pre-orders.")

        # Calculate the 20% buffer based on pre-orders
        buffer = int(pre_order_count * 0.20)
        # Buffer split: 10% for late pre-book (1am-11am), 10% for walk-in
        prebook_buffer = buffer // 2
        walkin_buffer = buffer - prebook_buffer

        # Update the day-specific stock record
        stock.prebook_pool = prebook_buffer
        stock.walkin_pool = walkin_buffer
        stock.admin_base_stock = pre_order_count + buffer
        print(f"Updated '{item.name}': Pre-book Buffer={stock.prebook_pool}, Walk-in Buffer={stock.walkin_pool}, Total={stock.admin_base_stock}")

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

def get_all_food_items(day=None):
    # Return all food items with their stock for the given day (default: today)
    from .database import SessionLocal
    from .models import FoodItem, FoodStock
    import datetime
    db = SessionLocal()
    items = db.query(FoodItem).all()
    if not day:
        day = datetime.datetime.now().strftime('%A').lower()
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
    db.close()
    return result

def process_5pm_breakfast_recalc(db: Session):
    """
    Recalculates breakfast stock based on pre-orders before 5 PM the day prior.
    New Total Stock = (Pre-order Count) + 20% Buffer.
    The buffer is split: 10% for late pre-booking (5pm-7am), 10% for walk-in.
    """
    print("Executing 5 PM breakfast recalculation for tomorrow...")
    breakfast_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'breakfast').all()
    import datetime
    target_date = get_current_date() + datetime.timedelta(days=1)
    day_of_week = target_date.strftime('%A').lower()

    logic_status['breakfast_5pm'] = get_current_date()
    # Mark logic as run for today in the database
    logic_run = db.query(models.LogicRun).filter(models.LogicRun.logic_name == 'breakfast_5pm').first()
    if logic_run:
        logic_run.last_run_date = today
    else:
        db.add(models.LogicRun(logic_name='breakfast_5pm', last_run_date=today))

    for item in breakfast_items:
        stock = get_or_create_stock(db, item.id, day_of_week)

        # Sum the exact quantity of confirmed pre-orders for tomorrow
        total_qty = db.query(func.sum(models.BookedItem.quantity)).join(models.Booking).filter(
            models.BookedItem.food_item_id == item.id,
            models.Booking.booking_date == target_date,
            models.Booking.status == 'confirmed'
        ).scalar()
        pre_order_count = total_qty if total_qty is not None else 0

        print(f"Item '{item.name}' (ID: {item.id}) has {pre_order_count} pre-orders for tomorrow.")

        buffer = int(pre_order_count * 0.20)

        prebook_buffer = buffer // 2
        walkin_buffer = buffer - prebook_buffer

        stock.prebook_pool = prebook_buffer
        stock.walkin_pool = walkin_buffer
        stock.admin_base_stock = pre_order_count + buffer
        print(f"Updated '{item.name}': Pre-book Pool={stock.prebook_pool}, Walk-in Pool={stock.walkin_pool}, Total={stock.admin_base_stock}")

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

    # Mark logic as run for today
    logic_status['breakfast_7am'] = get_current_date()
    # Mark logic as run for today in the database
    logic_run = db.query(models.LogicRun).filter(models.LogicRun.logic_name == 'breakfast_7am').first()
    if logic_run:
        logic_run.last_run_date = today
    else:
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
    for item in lunch_items:
        stock = get_or_create_stock(db, item.id, day_of_week)
        print(f"Item '{item.name}' (ID: {item.id}): Moving {stock.prebook_pool} items from pre-book buffer to walk-in.")
        stock.walkin_pool += stock.prebook_pool
        stock.prebook_pool = 0
        print(f"Updated '{item.name}': Pre-book Pool={stock.prebook_pool}, Walk-in Pool={stock.walkin_pool}")

    db.commit()
    print("11 AM lunch rollover complete.")