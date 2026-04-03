import argparse
import sys
from getpass import getpass

from passlib.context import CryptContext

from backend.database import SessionLocal
from backend.models import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def validate_password(password: str) -> None:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password is too long and cannot exceed 72 bytes.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def main() -> int:
    parser = argparse.ArgumentParser(description="Change a user's password in the database.")
    parser.add_argument("admission_no", help="User admission number")
    parser.add_argument(
        "new_password",
        nargs="?",
        help="New password. If omitted, you will be prompted securely.",
    )
    args = parser.parse_args()

    new_password = args.new_password or getpass("New password: ")

    try:
        validate_password(new_password)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.admission_no == args.admission_no).first()
        if user is None:
            print(f"User not found: {args.admission_no}")
            return 1

        user.password = hash_password(new_password)
        db.commit()
        print(f"Password updated for user {args.admission_no}.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"Error updating password: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())