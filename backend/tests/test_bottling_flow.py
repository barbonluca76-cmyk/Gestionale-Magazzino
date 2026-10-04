"""Retest for bottling + create endpoints after serialization fix."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or ""
# Try reading from frontend .env if not in env
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "barbonluca76@gmail.com"
ADMIN_PASSWORD = "Barbon2026!"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def ids(client):
    """Create a raw group + raw item + finished group used by all tests."""
    # raw group
    r = client.post(f"{BASE_URL}/api/groups",
                    json={"name": "TEST_raw_grp", "kind": "raw", "description": "t"})
    assert r.status_code == 200, r.text
    g = r.json()
    assert "id" in g and "_id" not in g
    raw_group_id = g["id"]

    # finished group
    r = client.post(f"{BASE_URL}/api/groups",
                    json={"name": "TEST_fin_grp", "kind": "finished", "description": "t"})
    assert r.status_code == 200, r.text
    fg = r.json()
    assert "id" in fg and "_id" not in fg
    fin_group_id = fg["id"]

    # raw item
    r = client.post(f"{BASE_URL}/api/raw-items", json={
        "group_id": raw_group_id, "name": "TEST_bottle_075",
        "quantity": 1000, "unit": "pz", "min_threshold": 100,
    })
    assert r.status_code == 200, r.text
    raw = r.json()
    assert "id" in raw and "_id" not in raw
    assert raw["quantity"] == 1000
    raw_item_id = raw["id"]

    # finished item (existing lot)
    r = client.post(f"{BASE_URL}/api/finished-items", json={
        "group_id": fin_group_id, "name": "TEST_lot_A",
        "quantity": 50, "unit": "bott.", "min_threshold": 10,
        "bottle_capacity_l": 0.75,
    })
    assert r.status_code == 200, r.text
    fin = r.json()
    assert "id" in fin and "_id" not in fin
    assert fin["quantity"] == 50
    finished_item_id = fin["id"]

    return {
        "raw_group_id": raw_group_id,
        "fin_group_id": fin_group_id,
        "raw_item_id": raw_item_id,
        "finished_item_id": finished_item_id,
    }


class TestCreateEndpointsSerialization:
    def test_groups_no_objectid(self, ids):
        assert "_id" not in ids and ids["raw_group_id"]

    def test_raw_item_no_objectid(self, client, ids):
        # verify GET returns it
        r = client.get(f"{BASE_URL}/api/raw-items", params={"group_id": ids["raw_group_id"]})
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == ids["raw_item_id"] for i in items)
        for i in items:
            assert "_id" not in i

    def test_finished_item_no_objectid(self, client, ids):
        r = client.get(f"{BASE_URL}/api/finished-items", params={"group_id": ids["fin_group_id"]})
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == ids["finished_item_id"] for i in items)


class TestBottlingTenutaBarbon:
    """supplier=tenuta_barbon - should decrement raw materials."""

    def test_bottling_tenuta_decrements_raw_and_increments_finished(self, client, ids):
        # snapshot raw qty
        r = client.get(f"{BASE_URL}/api/raw-items", params={"group_id": ids["raw_group_id"]})
        raw_before = next(i for i in r.json() if i["id"] == ids["raw_item_id"])["quantity"]

        r = client.get(f"{BASE_URL}/api/finished-items", params={"group_id": ids["fin_group_id"]})
        fin_before = next(i for i in r.json() if i["id"] == ids["finished_item_id"])["quantity"]

        payload = {
            "supplier": "tenuta_barbon",
            "wine_name": "TEST Wine",
            "finished_item_id": ids["finished_item_id"],
            "bottle_count": 100,
            "bottle_capacity_l": 0.75,
            "carton_size": 6,
            "carton_count": 17,
            "materials": [{"raw_item_id": ids["raw_item_id"], "quantity": 100}],
            "notes": "test tenuta",
        }
        r = client.post(f"{BASE_URL}/api/bottling", json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert "id" in rec and "_id" not in rec
        assert rec["hl"] == round(100 * 0.75 / 100.0, 4)
        assert rec["supplier"] == "tenuta_barbon"
        assert len(rec["materials"]) == 1
        # tenuta -> not_deducted should NOT be true/present
        assert not rec["materials"][0].get("not_deducted")

        pytest.bottling_tenuta_id = rec["id"]

        # raw decremented
        r = client.get(f"{BASE_URL}/api/raw-items", params={"group_id": ids["raw_group_id"]})
        raw_after = next(i for i in r.json() if i["id"] == ids["raw_item_id"])["quantity"]
        assert raw_after == raw_before - 100, f"{raw_before} -> {raw_after}"

        # finished incremented
        r = client.get(f"{BASE_URL}/api/finished-items", params={"group_id": ids["fin_group_id"]})
        fin_after = next(i for i in r.json() if i["id"] == ids["finished_item_id"])["quantity"]
        assert fin_after == fin_before + 100

    def test_pdf_download(self, client):
        bid = getattr(pytest, "bottling_tenuta_id", None)
        assert bid, "need bottling id"
        r = client.get(f"{BASE_URL}/api/bottling/{bid}/pdf")
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"


class TestBottlingCliente:
    """supplier=cliente - should NOT decrement raw materials; set not_deducted flag."""

    def test_bottling_cliente_no_decrement(self, client, ids):
        r = client.get(f"{BASE_URL}/api/raw-items", params={"group_id": ids["raw_group_id"]})
        raw_before = next(i for i in r.json() if i["id"] == ids["raw_item_id"])["quantity"]

        payload = {
            "supplier": "cliente",
            "client_name": "Cliente X",
            "wine_name": "TEST Cliente Wine",
            "finished_item_id": ids["finished_item_id"],
            "bottle_count": 50,
            "bottle_capacity_l": 0.75,
            "carton_size": 12,
            "carton_count": 5,
            "materials": [{"raw_item_id": ids["raw_item_id"], "quantity": 50}],
        }
        r = client.post(f"{BASE_URL}/api/bottling", json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["supplier"] == "cliente"
        assert rec["materials"][0].get("not_deducted") is True

        r = client.get(f"{BASE_URL}/api/raw-items", params={"group_id": ids["raw_group_id"]})
        raw_after = next(i for i in r.json() if i["id"] == ids["raw_item_id"])["quantity"]
        assert raw_after == raw_before, "cliente should not decrement"


class TestBottlingNewLot:
    def test_bottling_creates_new_lot(self, client, ids):
        payload = {
            "supplier": "tenuta_barbon",
            "wine_name": "TEST New Lot Wine",
            "new_lot_name": "TEST_new_lot_Z",
            "finished_group_id": ids["fin_group_id"],
            "bottle_count": 200,
            "bottle_capacity_l": 0.75,
            "carton_size": 6,
            "carton_count": 34,
            "materials": [{"raw_item_id": ids["raw_item_id"], "quantity": 10}],
        }
        r = client.post(f"{BASE_URL}/api/bottling", json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["wine_name"] == "TEST_new_lot_Z"
        assert rec["bottle_count"] == 200
        # new lot should exist with qty 200
        r = client.get(f"{BASE_URL}/api/finished-items", params={"group_id": ids["fin_group_id"]})
        new_lot = next((i for i in r.json() if i["name"] == "TEST_new_lot_Z"), None)
        assert new_lot is not None
        assert new_lot["quantity"] == 200


class TestMovementsAndDashboard:
    def test_movement_has_bottling_id(self, client):
        r = client.get(f"{BASE_URL}/api/movements", params={"kind": "bottling", "limit": 20})
        assert r.status_code == 200
        movs = r.json()
        assert len(movs) >= 1
        latest = movs[0]
        assert latest["kind"] == "bottling"
        assert "bottling_id" in latest.get("extra", {})

    def test_dashboard_summary(self, client):
        r = client.get(f"{BASE_URL}/api/dashboard/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ["raw_total", "finished_total", "total_bottles", "total_hl", "bottling_this_month"]:
            assert k in d
        assert d["bottling_this_month"] >= 3  # we created 3 records above
