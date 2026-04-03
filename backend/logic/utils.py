def calculate_deposit_percentage(flags: int) -> int:
    """
    Calculates the pre-order deposit percentage based on the number of flags a user has.
    """
    if flags == 0:
        return 10
    elif flags == 1:
        return 10
    elif flags == 2:
        return 30
    elif flags == 3:
        return 50
    elif flags == 4:
        return 75
    else: # 5 or more flags
        return 100
