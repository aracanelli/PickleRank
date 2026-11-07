"""A league that never configured payments stores paymentSettings as null; that must mean 'off', not a crash."""
from uuid import uuid4

import pytest

from app.application.services.payment_service import PaymentService
from app.exceptions import BadRequestError


@pytest.mark.asyncio
async def test_null_payment_settings_is_tracking_off():
    service = PaymentService(conn=None)
    gid = uuid4()

    async def get_by_id(_):
        return {"id": gid, "owner_user_id": "owner", "settings": {"paymentSettings": None}}

    service.groups_repo.get_by_id = get_by_id
    with pytest.raises(BadRequestError):
        await service.get_sub_balances("owner", gid)
