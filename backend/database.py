import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker


DATABASE_URL = "postgresql://postgres.nabophvqcuatxjhgnaat:bingerlover%4018@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"

print("--- ATTEMPTING CONNECTION ---")

try:
    engine = create_engine(DATABASE_URL)
    # This test connection ensures your credentials are correct
    with engine.connect() as connection:
        print("✅ CONNECTION SUCCESSFUL!")
except Exception as e:
    print(f"❌ CONNECTION FAILED: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()