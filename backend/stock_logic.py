from datetime import datetime
from sqlalchemy.orm import Session
from . import models

def process_1am_lunch_recalc(db: Session):
    """Calculates 20% buffer from actual pre-orders and deletes excess stock."""
    lunch_items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'lunch').all()
    for item in lunch_items:
        # Count actual orders made before 1 AM
        actual_booked = db.query(models.BookedItem).filter(models.BookedItem.food_item_id == item.id).count()
        
        # New Stock = Actual + 20% Buffer
        buffer_total = int(actual_booked * 0.20)
        item.prebook_pool = buffer_total // 2  # 10% Pre-book buffer
        item.walkin_pool = buffer_total // 2   # 10% Walk-in buffer
        
        # Discard any admin stock that wasn't booked
        item.admin_base_stock = actual_booked + buffer_total 
    db.commit()

def process_7am_breakfast_rollover(db: Session):
    """Moves unbooked breakfast and cancellations to walk-in."""
    items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'breakfast').all()
    for item in items:
        item.walkin_pool += item.prebook_pool # Shift everything
        item.prebook_pool = 0
    db.commit()

def process_11am_lunch_rollover(db: Session):
    """Moves remaining lunch buffer and cancellations to walk-in."""
    items = db.query(models.FoodItem).filter(models.FoodItem.meal_type == 'lunch').all()
    for item in items:
        item.walkin_pool += item.prebook_pool
        item.prebook_pool = 0
    db.commit()