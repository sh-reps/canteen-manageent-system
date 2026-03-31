#!/usr/bin/env python3
"""
Seed fake historical data for the past 3 weeks
Includes orders and expenses
"""

import os
import sys
from datetime import datetime, date, timedelta
import random
from sqlalchemy.orm import sessionmaker

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from backend.database import engine
from backend.models import Booking, BookedItem, DailyExpense, WeeklyProfit, FoodItem, User

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def get_week_start_end(target_date):
    """Get the Monday-Sunday week for a given date"""
    dt = target_date if isinstance(target_date, datetime) else datetime.strptime(str(target_date), "%Y-%m-%d")
    monday = dt - timedelta(days=dt.weekday())
    sunday = monday + timedelta(days=6)
    return monday.date(), sunday.date()

def seed_historical_data():
    """Seed fake data for the past 3 weeks"""
    
    try:
        print("🌱 Seeding historical data for past 3 weeks...")
        
        # Get the date 3 weeks ago
        today = date.today()
        three_weeks_ago = today - timedelta(days=21)
        
        # Get all food items and users for random selection
        food_items = db.query(FoodItem).all()
        users = db.query(User).filter(User.role == 'student').limit(10).all()
        
        if not food_items or not users:
            print("❌ No food items or users found. Please add some first.")
            return
        
        print(f"📊 Using {len(food_items)} food items and {len(users)} users")
        
        # Calculate dates for each week
        weeks = []
        for i in range(3):
            current_date = three_weeks_ago + timedelta(days=i*7)
            week_start, week_end = get_week_start_end(current_date)
            weeks.append((week_start, week_end))
            print(f"📅 Week {i+1}: {week_start} to {week_end}")
        
        # Seed data for each week
        for week_idx, (week_start, week_end) in enumerate(weeks):
            print(f"\n✏️  Seeding Week {week_idx + 1}...")
            
            # Generate orders for each day of the week
            total_revenue = 0
            orders_count = 0
            
            for day_offset in range(7):
                current_date = week_start + timedelta(days=day_offset)
                
                # Skip if it's a future date
                if current_date > date.today():
                    continue
                
                # Generate 5-15 random orders per day
                num_orders = random.randint(5, 15)
                
                for _ in range(num_orders):
                    user = random.choice(users)
                    meal_type = random.choice(['breakfast', 'lunch'])
                    order_type = random.choice(['sit-in', 'parcel'])
                    
                    # Create booking
                    booking = Booking(
                        user_id=user.admission_no,
                        booking_date=current_date,
                        created_at=datetime.combine(current_date, datetime.min.time()),
                        scheduled_slot=meal_type,
                        order_type=order_type,
                        status='completed'
                    )
                    db.add(booking)
                    db.flush()  # Get the booking ID
                    
                    # Add 1-3 items to the booking
                    num_items = random.randint(1, 3)
                    for _ in range(num_items):
                        food = random.choice(food_items)
                        quantity = random.randint(1, 2)
                        
                        booked_item = BookedItem(
                            booking_id=booking.id,
                            food_item_id=food.id,
                            quantity=quantity
                        )
                        db.add(booked_item)
                        total_revenue += food.price_full * quantity
                    
                    orders_count += 1
            
            db.commit()
            print(f"   ✅ Added {orders_count} orders | Revenue: ₹{total_revenue}")
            
            # Generate expenses for the week
            week_expenses = 0
            new_expense_rows = []
            
            for day_offset in range(7):
                current_date = week_start + timedelta(days=day_offset)
                
                if current_date > date.today():
                    continue
                
                # Check if expense already exists for this date
                existing = db.query(DailyExpense).filter(
                    DailyExpense.expense_date == current_date
                ).first()
                
                if not existing:
                    # Generate random expense
                    amount = random.randint(300, 1400)  # Keep fake expenses realistic and below typical weekly revenue
                    descriptions = [
                        "Kitchen supplies",
                        "Gas/Fuel",
                        "Utilities",
                        "Ingredients",
                        "Maintenance",
                        "Staff meals",
                        "Equipment",
                        "Cleaning supplies"
                    ]
                    
                    expense = DailyExpense(
                        expense_date=current_date,
                        amount=amount,
                        description=random.choice(descriptions)
                    )
                    db.add(expense)
                    new_expense_rows.append(expense)
                    week_expenses += amount
            
            db.commit()

            # Ensure fake seeded data keeps revenue above expenses for chart readability
            if total_revenue > 0 and week_expenses >= total_revenue:
                target_expenses = max(int(total_revenue * 0.65), 1)
                reduction_needed = week_expenses - target_expenses

                for expense_row in reversed(new_expense_rows):
                    if reduction_needed <= 0:
                        break

                    max_reducible = max(expense_row.amount - 100, 0)
                    if max_reducible <= 0:
                        continue

                    cut = min(max_reducible, reduction_needed)
                    expense_row.amount -= cut
                    reduction_needed -= cut

                db.commit()
                week_expenses = sum(row.amount for row in new_expense_rows)

            print(f"   💰 Added expenses | Total: ₹{week_expenses}")
            
            # Create weekly profit record
            net_profit = total_revenue - week_expenses
            
            existing_profit = db.query(WeeklyProfit).filter(
                WeeklyProfit.week_start_date == week_start
            ).first()
            
            if existing_profit:
                existing_profit.total_revenue = total_revenue
                existing_profit.total_expenses = week_expenses
                existing_profit.net_profit = net_profit
            else:
                weekly_record = WeeklyProfit(
                    week_start_date=week_start,
                    week_end_date=week_end,
                    total_revenue=total_revenue,
                    total_expenses=week_expenses,
                    net_profit=net_profit
                )
                db.add(weekly_record)
            
            db.commit()
            print(f"   📈 Week Profit: ₹{net_profit} (Revenue: ₹{total_revenue} - Expenses: ₹{week_expenses})")
        
        print("\n✅ Historical data seeded successfully!")
        
    except Exception as e:
        print(f"❌ Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    seed_historical_data()
