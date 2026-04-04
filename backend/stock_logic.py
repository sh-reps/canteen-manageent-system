from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from . import models
from .time_logic import get_current_date
import math

# Track if 1am/7am logic has run for today
import datetime

EVENT_HISTORY_LOOKBACK_DAYS = 120
EVENT_HISTORY_SAMPLE_DAYS = 6
REGULAR_HISTORY_SAMPLE_DAYS = 20


def _is_event_day(db: Session, target_date: datetime.date) -> models.Holiday | None:
    return db.query(models.Holiday).filter(
        models.Holiday.date == target_date,
        models.Holiday.day_type == 'event'
    ).first()


def _get_recent_event_dates(db: Session, target_date: datetime.date, limit: int = EVENT_HISTORY_SAMPLE_DAYS):
    rows = db.query(models.Holiday.date).filter(
        models.Holiday.day_type == 'event',
        models.Holiday.date < target_date
    ).order_by(models.Holiday.date.desc()).limit(limit).all()
    return [r[0] for r in rows]


def _avg_item_sales_for_dates(db: Session, food_item_id: int, dates: list[datetime.date]) -> float:
    if not dates:
        return 0.0

    by_date = db.query(
        models.Booking.booking_date,
        func.coalesce(func.sum(models.BookedItem.quantity), 0)
    ).join(
        models.BookedItem, models.BookedItem.booking_id == models.Booking.id
    ).filter(
        models.BookedItem.food_item_id == food_item_id,
        models.Booking.booking_date.in_(dates),
        models.Booking.status.notin_(['cancelled', 'no-show'])
    ).group_by(models.Booking.booking_date).all()

    qty_by_date = {row[0]: int(row[1] or 0) for row in by_date}
    total = sum(qty_by_date.get(d, 0) for d in dates)
    return total / max(1, len(dates))


def _avg_item_sales_for_recent_regular_days(db: Session, food_item_id: int, target_date: datetime.date) -> float:
    start_date = target_date - datetime.timedelta(days=EVENT_HISTORY_LOOKBACK_DAYS)
    grouped = db.query(
        models.Booking.booking_date,
        func.coalesce(func.sum(models.BookedItem.quantity), 0)
    ).join(
        models.BookedItem, models.BookedItem.booking_id == models.Booking.id
    ).filter(
        models.BookedItem.food_item_id == food_item_id,
        models.Booking.booking_date >= start_date,
        models.Booking.booking_date < target_date,
        models.Booking.status.notin_(['cancelled', 'no-show'])
    ).group_by(models.Booking.booking_date).order_by(models.Booking.booking_date.desc()).all()

    if not grouped:
        return 0.0

    event_dates = {d[0] for d in db.query(models.Holiday.date).filter(
        models.Holiday.day_type == 'event',
        models.Holiday.date >= start_date,
        models.Holiday.date < target_date
    ).all()}

    regular_sales = []
    for day, qty in grouped:
        if day.weekday() >= 5:
            continue
        if day in event_dates:
            continue
        regular_sales.append(int(qty or 0))
        if len(regular_sales) >= REGULAR_HISTORY_SAMPLE_DAYS:
            break

    if not regular_sales:
        return 0.0
    return sum(regular_sales) / len(regular_sales)


def _event_multiplier_for_item(db: Session, food_item_id: int, target_date: datetime.date) -> float:
    recent_event_dates = _get_recent_event_dates(db, target_date)
    if not recent_event_dates:
        return 1.0

    event_avg = _avg_item_sales_for_dates(db, food_item_id, recent_event_dates)
    regular_avg = _avg_item_sales_for_recent_regular_days(db, food_item_id, target_date)

    if event_avg <= 0:
        return 1.0
    if regular_avg <= 0:
        return 1.2

    raw = event_avg / regular_avg
    # Dampen spikes and clamp for stable stock planning.
    return max(1.0, min(2.5, 0.6 + (0.4 * raw)))

def process_1am_lunch_recalc(db: Session):
    """
    Recalculates lunch stock based on pre-orders before 1 AM.
    New Total Stock = (Pre-order Count) + 20% Buffer.
    The buffer is split: 10% for late pre-booking, 10% for walk-in.
    """
    print("Executing 1 AM lunch recalculation...")
    lunch_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type.in_(['lunch', 'snack'])).all()
    today = get_current_date()
    day_of_week = today.strftime('%A').lower()
    event_day = _is_event_day(db, today)
    manual_extra_pct = (event_day.lunch_snack_extra_pct if event_day else 0) or 0

    # Mark logic as run for today in the database
    db.add(models.LogicRun(logic_name='lunch_1am', last_run_date=today))

    for item in lunch_items:
        # Get the stock record for today to update it
        stock = get_or_create_stock(db, item.id, day_of_week)

        # The base stock is now a live counter. We just read it.
        pre_order_count = stock.admin_base_stock
        print(f"Item '{item.name}' (ID: {item.id}) has {pre_order_count} pre-orders.")
        history_multiplier = _event_multiplier_for_item(db, item.id, today) if event_day else 1.0
        algo_pct = 20.0 * history_multiplier
        total_pct = algo_pct + manual_extra_pct
        buffer = math.ceil(pre_order_count * (total_pct / 100.0))
        # Buffer split: 10% for late pre-book (1am-11am), 10% for walk-in
        prebook_buffer = buffer // 2
        walkin_buffer = buffer - prebook_buffer

        # Update the buffer pools based on the live base stock count
        stock.prebook_pool = prebook_buffer
        stock.walkin_pool = walkin_buffer
        print(
            f"Updated '{item.name}': Base={stock.admin_base_stock}, "
            f"AlgoPct={algo_pct:.2f}, ExtraPct={manual_extra_pct}, "
            f"Pre-book Buffer={stock.prebook_pool}, Walk-in Buffer={stock.walkin_pool}"
        )

    db.commit()
    print("1 AM lunch recalculation complete.")

# Helper: get or create FoodStock for a food item and day
def get_or_create_stock(db, food_item_id, day_of_week):
    from .models import FoodStock, FoodItem
    stock = db.query(FoodStock).filter_by(food_item_id=food_item_id, day_of_week=day_of_week).first()
    if not stock:
        # If no stock exists for the day, start from strict zero values.
        # This avoids accidental carryover/template values being treated as real stock.
        stock = FoodStock(
            food_item_id=food_item_id,
            day_of_week=day_of_week,
            admin_base_stock=0,
            prebook_pool=0,
            walkin_pool=0,
            breakfast_buffer=0,
        )
        db.add(stock)
        db.flush() # Flush to get an ID, but don't commit the transaction.
        db.refresh(stock)
    return stock

def get_all_food_items(db: Session, day=None):
    # Return all food items with their stock for the given day (default: today)
    from .models import FoodItem, FoodStock
    if not day:
        day = get_current_date().strftime('%A').lower()

    items = db.query(FoodItem).all()
    stocks = db.query(FoodStock).filter(FoodStock.day_of_week == day).all()
    stocks_by_food_id = {s.food_item_id: s for s in stocks}

    result = []
    for item in items:
        stock = stocks_by_food_id.get(item.id)
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

        buffer = math.ceil(pre_order_count * 0.20)
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
    lunch_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type.in_(['lunch', 'snack'])).all()
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

def process_10am_breakfast_clear(db: Session):
    """Clears all unsold breakfast stock at the end of the breakfast period."""
    print("Executing 10 AM breakfast stock clear...")
    breakfast_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'breakfast').all()
    today = get_current_date()
    day_of_week = today.strftime('%A').lower()

    cleared_count = 0
    for item in breakfast_items:
        stock = get_or_create_stock(db, item.id, day_of_week)
        if stock.walkin_pool > 0 or stock.prebook_pool > 0:
            cleared_count += 1
        stock.walkin_pool = 0
        stock.prebook_pool = 0
    
    # Mark logic as run for today in the database
    db.add(models.LogicRun(logic_name='breakfast_10am_clear', last_run_date=today))
    db.commit()
    print(f"✅ 10 AM breakfast stock clear complete. Cleared {cleared_count} items.")

def process_2pm_lunch_clear(db: Session):
    """Clears all unsold lunch stock at the end of the lunch period."""
    print("Executing 2 PM lunch stock clear...")
    lunch_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type.in_(['lunch', 'snack'])).all()
    today = get_current_date()
    day_of_week = today.strftime('%A').lower()

    cleared_count = 0
    for item in lunch_items:
        stock = get_or_create_stock(db, item.id, day_of_week)
        if stock.walkin_pool > 0 or stock.prebook_pool > 0:
            cleared_count += 1
        stock.walkin_pool = 0
        stock.prebook_pool = 0
    
    # Mark logic as run for today in the database
    db.add(models.LogicRun(logic_name='lunch_2pm_clear', last_run_date=today))
    db.commit()
    print(f"✅ 2 PM lunch stock clear complete. Cleared {cleared_count} items.")

def process_expired_orders(db: Session, now: datetime.datetime):
    """Finds confirmed orders that missed their 30-min window and moves items to walk-in."""
    today = now.date()
    
    # Get all confirmed bookings for today
    bookings = db.query(models.Booking).options(
        joinedload(models.Booking.items),
        joinedload(models.Booking.booked_seats)
    ).filter(
        models.Booking.booking_date == today,
        models.Booking.status == 'confirmed'
    ).all()

    user_ids = {b.user_id for b in bookings}
    users_by_id = {
        u.admission_no: u
        for u in db.query(models.User).filter(models.User.admission_no.in_(user_ids)).all()
    } if user_ids else {}
    
    expired_count = 0
    flagged_users = []
    
    for booking in bookings:
        if not booking.scheduled_slot:
            continue
        try:
            # Parse slot time, add 30 minute grace period
            time_str = booking.scheduled_slot[:5] # Extract HH:MM safely
            slot_time = datetime.datetime.strptime(time_str, "%H:%M").time()
            expiry_dt = datetime.datetime.combine(today, slot_time) + datetime.timedelta(minutes=30)
            
            if now >= expiry_dt:
                expired_count += 1
                booking.status = 'no-show'

                # Flag the user
                user = users_by_id.get(booking.user_id)
                if user:
                    current_flags = user.flags or 0
                    if current_flags < 5:
                        user.flags = current_flags + 1
                    else:
                        user.flags = current_flags
                    user.flagged_at = now
                    flagged_users.append((user.admission_no, user.flags))

                day_of_week = today.strftime('%A').lower()
                
                for booked_item in booking.items:
                    stock = get_or_create_stock(db, booked_item.food_item_id, day_of_week)
                    stock.walkin_pool += booked_item.quantity
                    
                for seat_reservation in booking.booked_seats:
                    db.delete(seat_reservation)
        except Exception as e:
            print(f"[ERROR] Failed to process expiry for booking {booking.id}: {e}")
    
    # Print summary instead of individual messages
    if expired_count > 0:
        print(f"🕒 {expired_count} booking(s) expired and moved to walk-in.")
        if flagged_users:
            print(f"   Flagged {len(flagged_users)} user(s): {', '.join([f'{u[0]} ({u[1]} flags)' for u in flagged_users])}")
    
    db.commit()

# A data structure to define our time-based triggers in a clear, extensible way.
# Format: (Hour to run after, Name in LogicRun table, Function to execute)
TIME_TRIGGERS = [
    (1, 'lunch_1am', process_1am_lunch_recalc),
    (7, 'breakfast_7am', process_7am_breakfast_rollover),
    (10, 'breakfast_10am_clear', process_10am_breakfast_clear),
    (11, 'lunch_11am', process_11am_lunch_rollover),
    (14, 'lunch_2pm_clear', process_2pm_lunch_clear),
    (17, 'breakfast_5pm', process_5pm_breakfast_recalc),
]

def is_working_day(target_date: datetime.date, db: Session) -> bool:
    """Check if a date is a working day (not a weekend and not a holiday)."""
    day_entry = db.query(models.Holiday).filter(models.Holiday.date == target_date).first()

    # Explicitly blocked holidays always remain non-working.
    if day_entry and ((day_entry.day_type == 'holiday') or (day_entry.day_type is None)):
        return False

    # Weekends are non-working unless explicitly overridden as event/working_day.
    if target_date.weekday() >= 5:  # 5 = Saturday, 6 = Sunday
        return bool(day_entry and day_entry.day_type in {'event', 'working_day'})

    holiday = db.query(models.Holiday).filter(
        models.Holiday.date == target_date,
        ((models.Holiday.day_type == 'holiday') | (models.Holiday.day_type.is_(None)))
    ).first()
    if holiday:
        return False
    return True

def evaluate_time_triggers(db: Session, skip_expiry: bool = False):
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
    
    # Continuously evaluate expirations for today's orders (No-shows)
    if today_working and not skip_expiry:
        process_expired_orders(db, now)

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