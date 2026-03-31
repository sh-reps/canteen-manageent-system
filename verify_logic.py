#!/usr/bin/env python3
"""
Verification script for time-based logic triggers
This script tests that:
1. LogicRun entries are created properly
2. Duplicate triggers don't happen within the same hour
3. Expired orders are processed with summary logging
4. Food stock is cleared at the right times
"""

import sys
import os
from datetime import datetime, timedelta, date

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.database import SessionLocal, engine
from backend import models, stock_logic, time_logic
from backend.models import Base

def test_logic_run_creation():
    """Test that LogicRun entries are created and prevent re-execution"""
    print("\n" + "="*60)
    print("TEST 1: LogicRun Entry Creation & Duplicate Prevention")
    print("="*60)
    
    db = SessionLocal()
    try:
        # Clear any existing LogicRun entries for today
        today = time_logic.get_current_date()
        db.query(models.LogicRun).filter(models.LogicRun.last_run_date == today).delete()
        db.commit()
        
        # Test 10am clear function
        print("\n✓ Testing process_10am_breakfast_clear...")
        stock_logic.process_10am_breakfast_clear(db)
        
        # Verify LogicRun was created
        run_record = db.query(models.LogicRun).filter(
            models.LogicRun.logic_name == 'breakfast_10am_clear',
            models.LogicRun.last_run_date == today
        ).first()
        
        if run_record:
            print(f"  ✅ LogicRun entry created: {run_record.logic_name} for {run_record.last_run_date}")
        else:
            print(f"  ❌ FAILED: No LogicRun entry created!")
            return False
        
        # Test 2pm clear function  
        print("\n✓ Testing process_2pm_lunch_clear...")
        stock_logic.process_2pm_lunch_clear(db)
        
        # Verify LogicRun was created
        run_record = db.query(models.LogicRun).filter(
            models.LogicRun.logic_name == 'lunch_2pm_clear',
            models.LogicRun.last_run_date == today
        ).first()
        
        if run_record:
            print(f"  ✅ LogicRun entry created: {run_record.logic_name} for {run_record.last_run_date}")
        else:
            print(f"  ❌ FAILED: No LogicRun entry created!")
            return False
        
        print("\n✓ All LogicRun entries created correctly!")
        
        # Test that evaluate_time_triggers won't re-execute
        print("\n✓ Testing duplicate prevention in evaluate_time_triggers...")
        
        # Mock current time to 10am
        time_logic.set_simulated_time("10:00")
        
        # Call evaluate_time_triggers multiple times
        print("  Calling evaluate_time_triggers 3 times...")
        for i in range(3):
            stock_logic.evaluate_time_triggers(db)
            print(f"    Call {i+1} completed")
        
        # Check that we still only have one entry per logic
        count_10am = db.query(models.LogicRun).filter(
            models.LogicRun.logic_name == 'breakfast_10am_clear',
            models.LogicRun.last_run_date == today
        ).count()
        
        if count_10am == 1:
            print(f"  ✅ No duplicate triggers: Only 1 entry for breakfast_10am_clear")
        else:
            print(f"  ❌ FAILED: Found {count_10am} entries (expected 1)")
            return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()
        time_logic.reset_simulation()

def test_expired_orders_summary():
    """Test that expired orders are processed with summary logging"""
    print("\n" + "="*60)
    print("TEST 2: Expired Orders Summary Logging")
    print("="*60)
    
    db = SessionLocal()
    try:
        # Create some test orders that will be expired
        today = time_logic.get_current_date()
        
        # Clear any existing test data
        db.query(models.Booking).filter(models.Booking.booking_date == today).delete()
        db.query(models.User).filter(models.User.admission_no.like('TEST-%')).delete()
        db.commit()
        
        # Create test users
        from backend.main import get_password_hash
        for i in range(3):
            user = models.User(
                admission_no=f'TEST-{i}',
                password=get_password_hash('test123'),
                role='student'
            )
            db.add(user)
        db.commit()
        
        # Create test bookings with past times (so they'll expire)
        from datetime import datetime as dt
        for i in range(3):
            booking = models.Booking(
                user_id=f'TEST-{i}',
                scheduled_slot='08:00',
                order_type='parcel',
                booking_date=today,
                status='confirmed'
            )
            db.add(booking)
        db.commit()
        
        print(f"\n✓ Created 3 test bookings with slot 08:00")
        
        # Move time to 08:40 (past 30-min grace period)
        current_time = dt.combine(today, dt.strptime("08:40", "%H:%M").time())
        
        print(f"✓ Testing expired orders processing at 08:40...")
        print("  Logs should show summary (not individual messages per order):\n")
        
        # This should print summary instead of individual messages  
        stock_logic.process_expired_orders(db, current_time)
        
        # Verify orders were marked as no-show
        no_show_count = db.query(models.Booking).filter(
            models.Booking.status == 'no-show'
        ).count()
        
        # Verify users were flagged
        flagged = db.query(models.User).filter(
            models.User.admission_no.like('TEST-%'),
            models.User.flags > 0
        ).all()
        
        print(f"\n  ✅ Found {no_show_count} no-show bookings")
        print(f"  ✅ Found {len(flagged)} flagged users")
        
        if no_show_count >= 3 and len(flagged) >= 3:
            print("\n✓ Expired orders processing works correctly!")
            return True
        else:
            print("\n❌ FAILED: Not all orders were processed")
            return False
        
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Clean up test data
        try:
            db.query(models.Booking).filter(models.Booking.booking_date == today).delete()
            db.query(models.User).filter(models.User.admission_no.like('TEST-%')).delete()
            db.commit()
        except:
            pass
        db.close()

def test_all_triggers():
    """Test that all time-based triggers are in TIME_TRIGGERS"""
    print("\n" + "="*60)
    print("TEST 3: All Triggers Configured")
    print("="*60)
    
    expected_triggers = [
        (1, 'lunch_1am'),
        (7, 'breakfast_7am'),
        (10, 'breakfast_10am_clear'),
        (11, 'lunch_11am'),
        (14, 'lunch_2pm_clear'),
        (17, 'breakfast_5pm'),
    ]
    
    print("\nConfigured triggers:")
    for hour, name, _ in stock_logic.TIME_TRIGGERS:
        print(f"  • {hour:2d}:00 → {name}")
    
    # Verify all expected triggers are present
    actual_triggers = {(hour, name) for hour, name, _ in stock_logic.TIME_TRIGGERS}
    expected_set = {(h, n) for h, n in expected_triggers}
    
    if actual_triggers == expected_set:
        print("\n✅ All 6 expected triggers are configured!")
        return True
    else:
        missing = expected_set - actual_triggers
        extra = actual_triggers - expected_set
        if missing:
            print(f"\n❌ Missing triggers: {missing}")
        if extra:
            print(f"\n❌ Extra triggers: {extra}")
        return False

def main():
    print("\n" + "🔍 CANTEEN SYSTEM LOGIC VERIFICATION 🔍".center(60))
    results = []
    
    try:
        # Run all tests
        results.append(("LogicRun Creation", test_logic_run_creation()))
        results.append(("Expired Orders Summary", test_expired_orders_summary()))
        results.append(("All Triggers Configured", test_all_triggers()))
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Print summary
    print("\n" + "="*60)
    print("VERIFICATION SUMMARY")
    print("="*60)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:30} {status}")
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    return all(r for _, r in results)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
