"""Add food reviews table

Revision ID: f001
Revises: a6629ca89591
Create Date: 2026-03-31 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f001'
down_revision: Union[str, Sequence[str], None] = 'a6629ca89591'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'food_reviews',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('food_item_id', sa.Integer(), sa.ForeignKey('food_items.id'), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.admission_no'), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('review_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('food_reviews')
