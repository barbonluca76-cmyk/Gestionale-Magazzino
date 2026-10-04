"""Backend tests for new barcode scan endpoints and barcode field on items."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wine-inventory-hub-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "barbonluca76@gmail.com"
ADMIN_PASS = "Barbon2026!"


@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- Scan lookup ----------
class TestScanLookup:
    def test_scan_raw_bot_075_verde(self, auth_session):
        r = auth_session.get(f"{API}/scan/BOT-075-VERDE")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["kind"] == "raw"
        assert data["item"]["barcode"] == "BOT-075-VERDE"
        assert "name" in data["item"]
        assert data["group_name"]  # non-empty

    def test_scan_finished_wine_cab(self, auth_session):
        r = auth_session.get(f"{API}/scan/WINE-CAB-2022-A")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["kind"] == "finished"
        assert data["item"]["barcode"] == "WINE-CAB-2022-A"
        assert data["group_name"]

    def test_scan_not_found(self, auth_session):
        r = auth_session.get(f"{API}/scan/NONEXISTENT-XYZ-123")
        assert r.status_code == 404
        detail = r.json().get("detail", "")
        # Italian error message
        assert "Nessun articolo" in detail or "codice" in detail.lower()

    def test_scan_unauthenticated(self):
        r = requests.get(f"{API}/scan/BOT-075-VERDE")
        assert r.status_code == 401


# ---------- Scan adjust ----------
class TestScanAdjust:
    def test_adjust_raw_positive(self, auth_session):
        # read current
        r0 = auth_session.get(f"{API}/scan/BOT-075-VERDE")
        assert r0.status_code == 200
        q0 = r0.json()["item"].get("quantity") or 0

        r = auth_session.post(f"{API}/scan/adjust", json={
            "code": "BOT-075-VERDE", "quantity_delta": 5, "reason": "Test positivo"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["kind"] == "raw"
        assert data["item"]["quantity"] == q0 + 5

        # verify persistence via GET
        r2 = auth_session.get(f"{API}/scan/BOT-075-VERDE")
        assert r2.json()["item"]["quantity"] == q0 + 5

    def test_adjust_raw_negative(self, auth_session):
        r0 = auth_session.get(f"{API}/scan/BOT-075-BIANCA")
        q0 = r0.json()["item"].get("quantity") or 0
        r = auth_session.post(f"{API}/scan/adjust", json={
            "code": "BOT-075-BIANCA", "quantity_delta": -3, "reason": "Test negativo"
        })
        assert r.status_code == 200
        assert r.json()["item"]["quantity"] == q0 - 3

    def test_adjust_finished(self, auth_session):
        r0 = auth_session.get(f"{API}/scan/WINE-CAB-2022-A")
        q0 = r0.json()["item"].get("quantity") or 0
        r = auth_session.post(f"{API}/scan/adjust", json={
            "code": "WINE-CAB-2022-A", "quantity_delta": 2, "reason": "Test fin"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["kind"] == "finished"
        assert data["item"]["quantity"] == q0 + 2

    def test_adjust_unknown_code(self, auth_session):
        r = auth_session.post(f"{API}/scan/adjust", json={
            "code": "UNKNOWN-ZZZ-999", "quantity_delta": 1, "reason": "x"
        })
        assert r.status_code == 404

    def test_adjust_unauthenticated(self):
        r = requests.post(f"{API}/scan/adjust", json={
            "code": "BOT-075-VERDE", "quantity_delta": 1, "reason": "nope"
        })
        assert r.status_code == 401

    def test_movement_logged_after_adjust(self, auth_session):
        unique_reason = f"Pytest-{uuid.uuid4().hex[:8]}"
        r = auth_session.post(f"{API}/scan/adjust", json={
            "code": "BOT-075-RENANA", "quantity_delta": 1, "reason": unique_reason
        })
        assert r.status_code == 200
        # fetch movements
        rm = auth_session.get(f"{API}/movements")
        assert rm.status_code == 200
        movs = rm.json()
        assert isinstance(movs, list)
        matching = [m for m in movs if m.get("kind") == "stock_adjust"
                    and (m.get("reason") or "").startswith("Scan —")
                    and unique_reason in (m.get("reason") or "")]
        assert len(matching) >= 1, f"No matching stock_adjust movement found. Sample: {movs[:3]}"


# ---------- Barcode field persistence on raw/finished items ----------
class TestBarcodeFieldPersistence:
    @pytest.fixture(scope="class")
    def group_ids(self, auth_session):
        r = auth_session.get(f"{API}/groups")
        assert r.status_code == 200
        groups = r.json()
        raw_g = next((g for g in groups if g["kind"] == "raw"), None)
        fin_g = next((g for g in groups if g["kind"] == "finished"), None)
        assert raw_g and fin_g
        return {"raw": raw_g["id"], "finished": fin_g["id"]}

    def test_create_raw_with_barcode(self, auth_session, group_ids):
        bc = f"TEST-RAW-{uuid.uuid4().hex[:8].upper()}"
        payload = {
            "group_id": group_ids["raw"],
            "name": f"TEST_raw_{bc}",
            "quantity": 10,
            "unit": "pz",
            "min_threshold": 0,
            "notes": "",
            "barcode": bc,
        }
        r = auth_session.post(f"{API}/raw-items", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created.get("barcode") == bc
        item_id = created["id"]

        # verify via list GET
        rg = auth_session.get(f"{API}/raw-items")
        assert rg.status_code == 200
        found = next((x for x in rg.json() if x["id"] == item_id), None)
        assert found is not None
        assert found.get("barcode") == bc

        # verify scan lookup finds it
        rs = auth_session.get(f"{API}/scan/{bc}")
        assert rs.status_code == 200
        assert rs.json()["kind"] == "raw"

        # cleanup
        auth_session.delete(f"{API}/raw-items/{item_id}")

    def test_create_finished_with_barcode(self, auth_session, group_ids):
        bc = f"TEST-FIN-{uuid.uuid4().hex[:8].upper()}"
        payload = {
            "group_id": group_ids["finished"],
            "name": f"TEST_fin_{bc}",
            "quantity": 5,
            "unit": "bott.",
            "min_threshold": 0,
            "bottle_capacity_l": 0.75,
            "notes": "",
            "barcode": bc,
        }
        r = auth_session.post(f"{API}/finished-items", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created.get("barcode") == bc
        item_id = created["id"]

        rg = auth_session.get(f"{API}/finished-items")
        found = next((x for x in rg.json() if x["id"] == item_id), None)
        assert found and found.get("barcode") == bc

        rs = auth_session.get(f"{API}/scan/{bc}")
        assert rs.status_code == 200
        assert rs.json()["kind"] == "finished"

        auth_session.delete(f"{API}/finished-items/{item_id}")
