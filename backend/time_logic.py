import os
import json
from datetime import datetime, timedelta, time, date

# File to persistently store the time difference
OFFSET_FILE = os.path.join(os.path.dirname(__file__), "time_offset.json")

def get_offset() -> timedelta:
    """Reads the time offset from the JSON file."""
    if os.path.exists(OFFSET_FILE):
        try:
            with open(OFFSET_FILE, "r") as f:
                data = json.load(f)
                return timedelta(seconds=data.get("offset_seconds", 0))
        except (json.JSONDecodeError, IOError):
            # If file is corrupted or unreadable, return zero offset
            return timedelta(seconds=0)
    return timedelta(seconds=0)

def save_offset(td: timedelta):
    """Saves the time offset to the JSON file."""
    with open(OFFSET_FILE, "w") as f:
        json.dump({"offset_seconds": td.total_seconds()}, f)

def get_current_datetime() -> datetime:
    """Returns the current time, adjusted by the persistent mock offset."""
    return datetime.now() + get_offset()

def get_current_date() -> date:
    """Returns the current date, adjusted by the mock offset."""
    return get_current_datetime().date()

def get_current_time() -> datetime:
    """Alias for get_current_datetime for backward compatibility."""
    return get_current_datetime()

def get_current_time_as_time() -> time:
    """Returns the current time of day, adjusted by the mock offset."""
    return get_current_datetime().time()

def set_simulated_time(time_str: str):
    """
    Sets the clock to a specific time today without changing the date.
    This calculates a new offset from the REAL current time and persists it.
    Passing an empty string resets the time simulation to follow real time.
    """
    real_now = datetime.now()
    current_simulated_dt = real_now + get_offset()

    if not time_str:
        # Reset only the time component of the simulation
        target_dt = current_simulated_dt.replace(
            hour=real_now.hour, minute=real_now.minute, second=real_now.second, microsecond=real_now.microsecond
        )
    else:
        # Handle both "HH:MM" and "HH:MM:SS" formats
        parts = time_str.split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2]) if len(parts) > 2 else 0
        target_dt = current_simulated_dt.replace(hour=hours, minute=minutes, second=seconds, microsecond=0)
    
    new_offset = target_dt - real_now
    save_offset(new_offset)

def set_simulated_date(date_str: str):
    """
    Sets the clock to a specific date without changing the current time of day.
    This calculates a new offset from the REAL current time and persists it.
    Passing an empty string resets the date simulation to follow the real date.
    """
    real_now = datetime.now()
    current_simulated_dt = real_now + get_offset()

    if not date_str:
        # Reset only the date component of the simulation
        target_dt = current_simulated_dt.replace(
            year=real_now.year, month=real_now.month, day=real_now.day
        )
    else:
        year, month, day = map(int, date_str.split('-'))
        target_dt = current_simulated_dt.replace(year=year, month=month, day=day)
    
    new_offset = target_dt - real_now
    save_offset(new_offset)

def set_simulated_datetime(date_str: str, time_str: str):
    """
    Sets both the simulated date and time simultaneously.
    """
    real_now = datetime.now()
    current_simulated_dt = real_now + get_offset()

    year = current_simulated_dt.year
    month = current_simulated_dt.month
    day = current_simulated_dt.day
    hour = current_simulated_dt.hour
    minute = current_simulated_dt.minute
    second = current_simulated_dt.second

    if date_str:
        year, month, day = map(int, date_str.split('-'))
        
    if time_str:
        parts = time_str.split(':')
        hour = int(parts[0])
        minute = int(parts[1])
        second = int(parts[2]) if len(parts) > 2 else 0

    target_dt = current_simulated_dt.replace(year=year, month=month, day=day, hour=hour, minute=minute, second=second, microsecond=0)
    new_offset = target_dt - real_now
    save_offset(new_offset)

def reset_simulation():
    """Resets the simulation entirely by deleting the offset file."""
    if os.path.exists(OFFSET_FILE):
        os.remove(OFFSET_FILE)
