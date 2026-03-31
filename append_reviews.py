#!/usr/bin/env python3
import os

review_endpoints = '''

# ==========================================
# FOOD REVIEW ENDPOINTS
# ==========================================

@app.get("/api/reviews/food/{food_id}", response_model=dict)
def get_food_reviews(food_id: int, db: Session = Depends(get_db)):
    """Get all reviews for a food item with average rating"""
    
    # Check if food item exists
    food_item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not food_item:
        raise HTTPException(status_code=404, detail="Food item not found")
    
    # Get all reviews for this food item
    reviews = db.query(models.FoodReview).filter(
        models.FoodReview.food_item_id == food_id
    ).order_by(models.FoodReview.created_at.desc()).all()
    
    # Calculate average rating
    if reviews:
        avg_rating = sum(r.rating for r in reviews) / len(reviews)
    else:
        avg_rating = 0
    
    # Format reviews for response
    reviews_list = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "rating": r.rating,
            "review_text": r.review_text,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in reviews
    ]
    
    return {
        "food_id": food_id,
        "food_name": food_item.name,
        "average_rating": round(avg_rating, 1),
        "total_reviews": len(reviews),
        "reviews": reviews_list
    }

@app.post("/api/reviews")
def submit_review(admission_no: str = Body(...), food_id: int = Body(...), rating: int = Body(...), review_text: str = Body(None), db: Session = Depends(get_db)):
    """Submit a review for a food item"""
    
    # Validate rating
    if not (1 <= rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    # Check if user exists
    user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if food item exists
    food_item = db.query(models.FoodItem).filter(models.FoodItem.id == food_id).first()
    if not food_item:
        raise HTTPException(status_code=404, detail="Food item not found")
    
    # Check if user already reviewed this item
    existing_review = db.query(models.FoodReview).filter(
        models.FoodReview.food_item_id == food_id,
        models.FoodReview.user_id == admission_no
    ).first()
    
    if existing_review:
        # Update existing review
        existing_review.rating = rating
        existing_review.review_text = review_text
        existing_review.created_at = time_logic.get_current_datetime()
        db.commit()
        return {"status": "updated", "message": "Review updated successfully", "review_id": existing_review.id}
    else:
        # Create new review
        new_review = models.FoodReview(
            food_item_id=food_id,
            user_id=admission_no,
            rating=rating,
            review_text=review_text
        )
        db.add(new_review)
        db.commit()
        db.refresh(new_review)
        return {"status": "created", "message": "Review submitted successfully", "review_id": new_review.id}

@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int, admission_no: str = Query(None), db: Session = Depends(get_db)):
    """Delete a review. Owner or admin can delete"""
    
    review = db.query(models.FoodReview).filter(models.FoodReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    # Check permissions - owner or admin can delete
    if admission_no:
        user = db.query(models.User).filter(models.User.admission_no == admission_no).first()
        is_owner = review.user_id == admission_no
        is_admin = user and user.role == "admin"
        
        if not (is_owner or is_admin):
            raise HTTPException(status_code=403, detail="Not authorized to delete this review")
    
    db.delete(review)
    db.commit()
    return {"status": "success", "message": "Review deleted successfully"}
'''

# Append to main.py
with open("backend/main.py", "a") as f:
    f.write(review_endpoints)

print("✅ Review endpoints added to main.py")
