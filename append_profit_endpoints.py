#!/usr/bin/env python3
import os

# The routes to append
routes_code = '''
# --- PROFIT MANAGEMENT ---

def get_week_start_end(target_date):
    """Get the Monday-Sunday week for a given date"""
    from datetime import datetime, timedelta
    dt = datetime.strptime(str(target_date), "%Y-%m-%d") if isinstance(target_date, str) else target_date
    monday = dt - timedelta(days=dt.weekday())
    sunday = monday + timedelta(days=6)
    return monday.date(), sunday.date()

def calculate_week_revenue(week_start, week_end, db):
    """Calculate total revenue from completed orders for a week"""
    try:
        bookings = db.query(models.Booking).filter(
            models.Booking.booking_date >= week_start,
            models.Booking.booking_date <= week_end,
            models.Booking.status == "completed"
        ).all()
        
        total = 0
        for booking in bookings:
            for item in booking.items:
                food = db.query(models.FoodItem).filter(models.FoodItem.id == item.food_item_id).first()
                if food:
                    total += food.price_full * item.quantity
        return total
    except Exception as e:
        print(f"Error calculating revenue: {e}")
        return 0

@app.get("/api/admin/daily-expenses")
def get_daily_expenses(week_start: date = Query(None), db: Session = Depends(get_db)):
    """Get all daily expenses, optionally filtered by week"""
    try:
        if week_start:
            week_start_date, week_end_date = get_week_start_end(week_start)
            expenses = db.query(models.DailyExpense).filter(
                models.DailyExpense.expense_date >= week_start_date,
                models.DailyExpense.expense_date <= week_end_date
            ).order_by(models.DailyExpense.expense_date).all()
        else:
            expenses = db.query(models.DailyExpense).order_by(models.DailyExpense.expense_date.desc()).all()
        
        return [
            {
                'id': e.id,
                'expense_date': e.expense_date,
                'amount': e.amount,
                'description': e.description,
                'created_at': e.created_at,
                'updated_at': e.updated_at
            }
            for e in expenses
        ]
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/daily-expenses")
def add_or_update_daily_expense(expense_date: date = Body(...), amount: int = Body(...), description: str = Body(None), db: Session = Depends(get_db)):
    """Add or update a daily expense"""
    try:
        existing = db.query(models.DailyExpense).filter(
            models.DailyExpense.expense_date == expense_date
        ).first()
        
        if existing:
            existing.amount = amount
            existing.description = description
            existing.updated_at = time_logic.get_current_datetime()
            db.commit()
            action = "updated"
        else:
            new_expense = models.DailyExpense(
                expense_date=expense_date,
                amount=amount,
                description=description
            )
            db.add(new_expense)
            db.commit()
            action = "created"
        
        return {"status": action, "message": f"Expense {action} successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/weekly-profit")
def get_weekly_profit(week_start: date = Query(None), db: Session = Depends(get_db)):
    """Get profit data for a specific week and recalculate if needed"""
    try:
        if not week_start:
            week_start = time_logic.get_current_date()
        
        week_start_date, week_end_date = get_week_start_end(week_start)
        
        # Calculate revenue from completed orders
        revenue = calculate_week_revenue(week_start_date, week_end_date, db)
        
        # Get total expenses for the week
        expenses = db.query(models.DailyExpense).filter(
            models.DailyExpense.expense_date >= week_start_date,
            models.DailyExpense.expense_date <= week_end_date
        ).all()
        
        total_expenses = sum(e.amount for e in expenses)
        net_profit = revenue - total_expenses
        
        # Get or create weekly profit record
        weekly_record = db.query(models.WeeklyProfit).filter(
            models.WeeklyProfit.week_start_date == week_start_date
        ).first()
        
        if weekly_record:
            weekly_record.total_revenue = revenue
            weekly_record.total_expenses = total_expenses
            weekly_record.net_profit = net_profit
            weekly_record.updated_at = time_logic.get_current_datetime()
            db.commit()
        else:
            weekly_record = models.WeeklyProfit(
                week_start_date=week_start_date,
                week_end_date=week_end_date,
                total_revenue=revenue,
                total_expenses=total_expenses,
                net_profit=net_profit
            )
            db.add(weekly_record)
            db.commit()
        
        # Get daily expenses for frontend
        daily_expenses = [
            {
                'expense_date': e.expense_date,
                'amount': e.amount,
                'description': e.description
            }
            for e in expenses
        ]
        
        return {
            "week_start_date": week_start_date,
            "week_end_date": week_end_date,
            "total_revenue": revenue,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "daily_expenses": daily_expenses
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/monthly-profit")
def get_monthly_profit(year: int = Query(None), month: int = Query(None), db: Session = Depends(get_db)):
    """Get profit data for all weeks in a month"""
    try:
        from datetime import datetime
        if not year or not month:
            today = time_logic.get_current_date()
            year = today.year
            month = today.month
        
        # Get all weekly profits for the month
        weekly_profits = db.query(models.WeeklyProfit).filter(
            models.WeeklyProfit.week_start_date >= date(year, month, 1),
            models.WeeklyProfit.week_start_date < date(year, month + 1 if month < 12 else 1, 1) if month < 12 else date(year + 1, 1, 1)
        ).order_by(models.WeeklyProfit.week_start_date).all()
        
        # If no data yet, calculate from expenses
        if not weekly_profits:
            # Get all daily expenses for the month
            start_date = date(year, month, 1)
            end_date = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)
            
            expenses = db.query(models.DailyExpense).filter(
                models.DailyExpense.expense_date >= start_date,
                models.DailyExpense.expense_date < end_date
            ).all()
            
            # Group by week and calculate
            weeks_data = {}
            for expense in expenses:
                week_start, week_end = get_week_start_end(expense.expense_date)
                if week_start not in weeks_data:
                    weeks_data[week_start] = {
                        'week_start': week_start,
                        'week_end': week_end,
                        'expenses': 0,
                        'revenue': 0
                    }
                weeks_data[week_start]['expenses'] += expense.amount
            
            # Calculate revenue for each week
            for week_start, data in weeks_data.items():
                data['revenue'] = calculate_week_revenue(data['week_start'], data['week_end'], db)
                data['profit'] = data['revenue'] - data['expenses']
                
                # Save to database
                db.add(models.WeeklyProfit(
                    week_start_date=data['week_start'],
                    week_end_date=data['week_end'],
                    total_revenue=data['revenue'],
                    total_expenses=data['expenses'],
                    net_profit=data['profit']
                ))
            db.commit()
            
            weekly_profits = list(weeks_data.values())
        else:
            weekly_profits = [
                {
                    'week_start': w.week_start_date,
                    'week_end': w.week_end_date,
                    'revenue': w.total_revenue,
                    'expenses': w.total_expenses,
                    'profit': w.net_profit
                }
                for w in weekly_profits
            ]
        
        return {
            "year": year,
            "month": month,
            "weeks": weekly_profits
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/admin/daily-expenses/{expense_id}")
def delete_daily_expense(expense_id: int, db: Session = Depends(get_db)):
    """Delete a daily expense"""
    try:
        expense = db.query(models.DailyExpense).filter(models.DailyExpense.id == expense_id).first()
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        db.delete(expense)
        db.commit()
        return {"status": "success", "message": "Expense deleted successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
'''

# Read the current main.py
with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Check if already added
if 'PROFIT MANAGEMENT' in content:
    print('✅ Profit endpoints already added to main.py')
else:
    # Append at the end
    with open('backend/main.py', 'a', encoding='utf-8') as f:
        f.write(routes_code)
    print('✅ Profit endpoints added to main.py')
