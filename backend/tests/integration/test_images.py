"""
Player photo and league logo endpoints: authorization, size cap, format allowlist,
metadata stripping and serve headers. DB access is mocked at the repository layer.
"""
from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from PIL import Image

from app.api.deps.rate_limit import limiter
from app.application.services.image_service import MAX_UPLOAD_BYTES, normalize_image
from tests.integration.conftest import TEST_USER_ID

GROUP_ID = uuid4()
GP_ID = uuid4()
OTHER_USER = uuid4()

GROUPS = "app.infrastructure.repositories.groups_repo.GroupsRepository"
IMAGES = "app.infrastructure.repositories.images_repo.ImagesRepository"
GPLAYERS = "app.infrastructure.repositories.players_repo.GroupPlayersRepository"


def _png(size=(64, 48), mode="RGB") -> bytes:
    buf = BytesIO()
    Image.new(mode, size, "red").save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_with_exif() -> bytes:
    """Landscape JPEG tagged 'rotate 90' with a camera make and GPS block."""
    img = Image.new("RGB", (80, 40), "blue")
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: rotate 90 CW
    exif[0x010F] = "SpyCam"  # Make
    exif[0x8825] = {1: "N", 2: (59.0, 54.0, 0.0)}  # GPS IFD
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def _group(owner=OTHER_USER):
    return {"id": GROUP_ID, "owner_user_id": owner}


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    limiter.reset()  # uploads are 10/minute; tests share one client IP


@pytest.fixture()
def repos():
    """Patch the repositories the image service uses. Default: caller is a plain member, not linked to GP_ID."""
    with patch(f"{GROUPS}.get_by_id", new_callable=AsyncMock) as get_group, \
         patch(f"{IMAGES}.get_group_player", new_callable=AsyncMock) as get_gp, \
         patch(f"{IMAGES}.upsert", new_callable=AsyncMock) as upsert, \
         patch(f"{IMAGES}.delete", new_callable=AsyncMock) as delete, \
         patch(f"{IMAGES}.get", new_callable=AsyncMock) as get_image, \
         patch(f"{GPLAYERS}.is_organizer", new_callable=AsyncMock) as is_org, \
         patch(f"{GPLAYERS}.is_member", new_callable=AsyncMock) as is_member:
        get_group.return_value = _group()
        get_gp.return_value = {"id": GP_ID, "user_id": OTHER_USER}
        upsert.return_value = 1762560000000
        is_org.return_value = False
        is_member.return_value = True
        yield {
            "get_group": get_group, "get_gp": get_gp, "upsert": upsert, "delete": delete,
            "get_image": get_image, "is_org": is_org, "is_member": is_member,
        }


PHOTO_URL = f"/api/groups/{GROUP_ID}/players/{GP_ID}/photo"
LOGO_URL = f"/api/groups/{GROUP_ID}/logo"


class TestAuthorization:
    def test_linked_player_can_set_own_photo(self, client, repos):
        repos["get_gp"].return_value = {"id": GP_ID, "user_id": UUID(TEST_USER_ID)}
        r = client.put(PHOTO_URL, content=_png())
        assert r.status_code == 200
        assert r.json() == {"photoVersion": 1762560000000}
        kind, ref, mime, data, w, h = repos["upsert"].call_args.args
        assert (kind, ref, mime) == ("player", GP_ID, "image/webp")
        assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"

    def test_organizer_can_set_any_player_photo(self, client, repos):
        repos["is_org"].return_value = True
        assert client.put(PHOTO_URL, content=_png()).status_code == 200

    def test_owner_can_set_logo(self, client, repos):
        repos["get_group"].return_value = _group(owner=UUID(TEST_USER_ID))
        r = client.put(LOGO_URL, content=_png())
        assert r.status_code == 200
        assert repos["upsert"].call_args.args[:2] == ("group", GROUP_ID)

    def test_other_player_cannot_set_photo(self, client, repos):
        r = client.put(PHOTO_URL, content=_png())
        assert r.status_code == 403
        repos["upsert"].assert_not_called()

    def test_other_player_cannot_delete_photo(self, client, repos):
        assert client.delete(PHOTO_URL).status_code == 403
        repos["delete"].assert_not_called()

    def test_unlinked_player_does_not_match_anyone(self, client, repos):
        repos["get_gp"].return_value = {"id": GP_ID, "user_id": None}
        assert client.put(PHOTO_URL, content=_png()).status_code == 403

    def test_player_cannot_set_logo(self, client, repos):
        assert client.put(LOGO_URL, content=_png()).status_code == 403
        assert client.delete(LOGO_URL).status_code == 403
        repos["upsert"].assert_not_called()
        repos["delete"].assert_not_called()

    def test_player_from_another_group_is_404(self, client, repos):
        repos["is_org"].return_value = True
        repos["get_gp"].return_value = None
        assert client.put(PHOTO_URL, content=_png()).status_code == 404

    def test_non_member_cannot_read(self, client, repos):
        repos["is_member"].return_value = False
        assert client.get(PHOTO_URL).status_code == 403
        assert client.get(LOGO_URL).status_code == 403
        repos["get_image"].assert_not_called()

    def test_organizer_can_remove_photo(self, client, repos):
        repos["is_org"].return_value = True
        assert client.delete(PHOTO_URL).status_code == 204
        repos["delete"].assert_called_once_with("player", GP_ID)


class TestUploadValidation:
    @pytest.fixture(autouse=True)
    def _organizer(self, repos):
        repos["is_org"].return_value = True

    def test_oversize_is_413(self, client, repos):
        r = client.put(PHOTO_URL, content=b"\xff" * (MAX_UPLOAD_BYTES + 1))
        assert r.status_code == 413
        repos["upsert"].assert_not_called()

    def test_oversize_without_content_length_is_413(self, client, repos):
        def chunks():
            for _ in range(3):
                yield b"\x00" * (MAX_UPLOAD_BYTES // 2 + 1)
        r = client.put(PHOTO_URL, content=chunks())
        assert r.status_code == 413
        repos["upsert"].assert_not_called()

    @pytest.mark.parametrize("body", [
        b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
        b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
        b"<html><script>alert(1)</script></html>",
        b"MZ\x90\x00not an image",
        b"",
        _png()[:40],  # truncated PNG
    ], ids=["svg", "gif", "html", "exe", "empty", "truncated"])
    def test_non_allowed_formats_are_415(self, client, repos, body):
        r = client.put(PHOTO_URL, content=body, headers={"Content-Type": "image/png"})
        assert r.status_code == 415
        repos["upsert"].assert_not_called()

    def test_real_gif_is_rejected(self, client, repos):
        buf = BytesIO()
        Image.new("RGB", (8, 8), "green").save(buf, format="GIF")
        assert client.put(PHOTO_URL, content=buf.getvalue()).status_code == 415

    def test_decompression_bomb_is_rejected(self, client, repos):
        bomb = _png(size=(10_000, 10_000), mode="1")  # tiny file, 100M pixels
        assert len(bomb) < MAX_UPLOAD_BYTES
        assert client.put(PHOTO_URL, content=bomb).status_code == 415
        repos["upsert"].assert_not_called()


class TestReencode:
    def test_exif_and_gps_are_stripped_and_orientation_applied(self):
        out, w, h = normalize_image(_jpeg_with_exif())
        img = Image.open(BytesIO(out))
        assert img.format == "WEBP"
        assert "exif" not in img.info and "xmp" not in img.info and "icc_profile" not in img.info
        assert len(img.getexif()) == 0
        assert b"SpyCam" not in out
        assert (w, h) == (40, 80)  # rotated upright from 80x40

    def test_downscaled_to_512(self):
        out, w, h = normalize_image(_png(size=(2000, 1000)))
        assert (w, h) == (512, 256)
        assert Image.open(BytesIO(out)).size == (512, 256)

    def test_png_alpha_and_webp_input_are_accepted(self):
        normalize_image(_png(mode="RGBA"))
        buf = BytesIO()
        Image.new("RGB", (10, 10)).save(buf, format="WEBP")
        assert normalize_image(buf.getvalue())[1:] == (10, 10)


class TestServe:
    def test_serve_headers(self, client, repos):
        payload, _, _ = normalize_image(_png())
        repos["get_image"].return_value = {
            "mime": "image/webp", "data": payload, "updated_at": datetime.now(timezone.utc),
        }
        r = client.get(PHOTO_URL)
        assert r.status_code == 200
        assert r.content == payload
        assert r.headers["content-type"] == "image/webp"
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["content-disposition"] == "inline"
        assert r.headers["content-security-policy"].startswith("default-src 'none'")
        assert r.headers["cache-control"].startswith("private")

    def test_missing_image_is_404(self, client, repos):
        repos["get_image"].return_value = None
        assert client.get(LOGO_URL).status_code == 404
