"""
Factory for creating rating system instances.
"""
from typing import Optional
from app.domain.ratings.base import RatingSystem
from app.domain.ratings.catch_up_elo import CatchUpEloRating
from app.domain.ratings.racs_elo import RacsEloRating
from app.domain.ratings.serious_elo import SeriousEloRating


def create_rating_system(
    system_type: str, 
    k_factor: float = 32, 
    elo_const: Optional[float] = None
) -> RatingSystem:
    """
    Create a rating system instance based on type.

    Args:
        system_type: "SERIOUS_ELO", "CATCH_UP", or "RACS_ELO"
        k_factor: K-factor for ELO calculations
        elo_const: ELO constant (divisor in expected score formula). 
                   Default: 400 for standard ELO, 0.3 for Rac's ELO

    Returns:
        RatingSystem instance
    """
    if system_type == "CATCH_UP":
        return CatchUpEloRating(k_factor=k_factor, elo_const=elo_const or 400.0)
    elif system_type == "RACS_ELO":
        return RacsEloRating(k_factor=k_factor, elo_const=elo_const or 0.3)
    else:
        # Default to SERIOUS_ELO
        return SeriousEloRating(k_factor=k_factor, elo_const=elo_const or 400.0)


