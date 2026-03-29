def get_current_datetime() -> datetime:
    """Returns the simulated or real current datetime (for created_at fields)."""
    return get_current_time()
from datetime import datetime, time, date

# Global variables to store the simulated date and time
simulated_time_obj = None
simulated_date_obj = None

def set_simulated_time(new_time: str):
    """Sets the simulated time from a string (HH:MM)."""
    global simulated_time_obj
    if new_time:
        simulated_time_obj = datetime.strptime(new_time, "%H:%M").time()
    else:
        simulated_time_obj = None

def set_simulated_date(new_date: str):
    """Sets the simulated date from a string (YYYY-MM-DD)."""
    global simulated_date_obj
    if new_date:
        simulated_date_obj = datetime.strptime(new_date, "%Y-%m-%d").date()
    else:
        simulated_date_obj = None

def get_current_time() -> datetime:
    """
    Returns a datetime object based on the simulation.
    - If simulated date and time are set, it combines them.
    - If only one is set, it combines it with the real current value.
    - If neither is set, it returns the real current datetime.
    """
    now = datetime.now()
    
    # Determine the effective date and time
    effective_date = simulated_date_obj if simulated_date_obj is not None else now.date()
    effective_time = simulated_time_obj if simulated_time_obj is not None else now.time()
    
    # Combine them into a new datetime object
    return datetime.combine(effective_date, effective_time)

def get_current_time_as_time() -> time:
    """Returns the simulated time if set, otherwise the real time."""
    return get_current_time().time()

def get_current_date() -> date:
    """Returns the simulated date if set, otherwise the real date."""
    return get_current_time().date()

