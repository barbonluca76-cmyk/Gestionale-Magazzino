"""Tests for new operator-select login + admin-only bottling cancel/reverse."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wine-inventory-hub-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def operators():
    r = requests.get(f"{API}/auth/operators-list", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) >= 2
    return data


@pytest.fixture(scope="module")
def admin_entry(operators):
    admins = [o for o in operators if o["role"] == "admin"]
    assert admins, f"no admin in operators list: {operators}"
    # prefer the seeded 'Ufficio' entry
    uf = [a for a in admins if "Ufficio" in a.get("name", "")]
    return uf[0] if uf else admins[0]


@pytest.fixture(scope="module")
def operator_entry(operators):
    ops = [o for o in operators if o["role"] == "operator"]
    assert ops, f"no operator in list: {operators}"
    cant = [o for o in ops if "Cantina" in o.get("name", "")]
    return cant[0] if cant else ops[0]


def _login(op_id):
    r = requests.post(f"{API}/auth/login", json={"operator_id": op_id}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(admin_entry):
    return _login(admin_entry["id"])


@pytest.fixture(scope="module")
def operator_token(operator_entry):
    return _login(operator_entry["id"])


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- operators-list / login / me ----------
class TestAuthFlow:
    def test_operators_list_is_public(self, operators):
        # ensure fields present
        for o in operators:
            assert "id" in o and "name" in o and "role" in o
        # has seeded admin and Cantina operator
        names = [o["name"] for o in operators]
        assert any("Ufficio" in n for n in names), names
        assert any("Cantina" in n for n in names), names

    def test_login_invalid_id_401(self):
        # valid-shape ObjectId that doesn't exist
        r = requests.post(f"{API}/auth/login", json={"operator_id": "000000000000000000000000"}, timeout=30)
        assert r.status_code == 401

    def test_login_bad_shape_401(self):
        r = requests.post(f"{API}/auth/login", json={"operator_id": "not-an-id"}, timeout=30)
        assert r.status_code == 401

    def test_auth_me_with_bearer(self, admin_token, admin_entry):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == admin_entry["id"]
        assert data["role"] == "admin"

    def test_auth_me_no_token_401(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# ---------- operator CRUD (admin only) ----------
class TestOperatorAdmin:
    def test_create_operator_requires_admin(self, operator_token):
        r = requests.post(f"{API}/auth/operators",
                          json={"name": "TEST_denied", "role": "operator"},
                          headers=_h(operator_token), timeout=30)
        assert r.status_code == 403

    def test_create_operator_admin_ok_and_delete(self, admin_token):
        payload = {"name": "TEST_newop_cancel", "role": "operator"}
        r = requests.post(f"{API}/auth/operators", json=payload,
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        new_id = r.json()["id"]
        assert r.json()["name"] == payload["name"]
        assert r.json()["role"] == "operator"
        # cleanup
        d = requests.delete(f"{API}/auth/operators/{new_id}",
                            headers=_h(admin_token), timeout=30)
        assert d.status_code == 200
        assert d.json().get("ok") is True

    def test_admin_cannot_delete_self(self, admin_token, admin_entry):
        r = requests.delete(f"{API}/auth/operators/{admin_entry['id']}",
                            headers=_h(admin_token), timeout=30)
        assert r.status_code == 400


# ---------- bottling cancel/reverse ----------
def _get_finished_cabernet(tok):
    r = requests.get(f"{API}/finished-items", headers=_h(tok), timeout=30)
    assert r.status_code == 200
    items = r.json()
    cab = [i for i in items if "Cabernet Riserva 2022" in i["name"]]
    assert cab, "seeded Cabernet lot not found"
    return cab[0]


def _get_raw(tok, barcode):
    r = requests.get(f"{API}/scan/{barcode}", headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["item"]


class TestBottlingCancel:
    def test_cancel_tenuta_barbon_reverses_everything(self, operator_token, admin_token):
        # snapshot inventories
        fin_before = _get_finished_cabernet(operator_token)
        raw1_before = _get_raw(operator_token, "BOT-075-VERDE")
        raw2_before = _get_raw(operator_token, "TAP-SUGHERO")

        payload = {
            "supplier": "tenuta_barbon",
            "wine_name": fin_before["name"],
            "finished_item_id": fin_before["id"],
            "bottle_count": 10,
            "bottle_capacity_l": 0.75,
            "carton_size": 6,
            "carton_count": 2,
            "materials": [
                {"raw_item_id": raw1_before["id"], "quantity": 10},
                {"raw_item_id": raw2_before["id"], "quantity": 10},
            ],
            "notes": "TEST_cancel_tenuta",
        }
        r = requests.post(f"{API}/bottling", json=payload, headers=_h(operator_token), timeout=30)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]

        # verify deductions applied
        fin_mid = _get_finished_cabernet(operator_token)
        raw1_mid = _get_raw(operator_token, "BOT-075-VERDE")
        assert fin_mid["quantity"] == fin_before["quantity"] + 10
        assert raw1_mid["quantity"] == raw1_before["quantity"] - 10

        # non-admin cannot delete
        bad = requests.delete(f"{API}/bottling/{bid}", headers=_h(operator_token), timeout=30)
        assert bad.status_code == 403

        # inventory unchanged after 403
        fin_mid2 = _get_finished_cabernet(operator_token)
        assert fin_mid2["quantity"] == fin_mid["quantity"]

        # admin deletes -> reverse
        d = requests.delete(f"{API}/bottling/{bid}", headers=_h(admin_token), timeout=30)
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True

        fin_after = _get_finished_cabernet(operator_token)
        raw1_after = _get_raw(operator_token, "BOT-075-VERDE")
        raw2_after = _get_raw(operator_token, "TAP-SUGHERO")
        assert fin_after["quantity"] == fin_before["quantity"], (fin_before, fin_after)
        assert raw1_after["quantity"] == raw1_before["quantity"]
        assert raw2_after["quantity"] == raw2_before["quantity"]

        # bottling record gone
        g = requests.get(f"{API}/bottling/{bid}", headers=_h(operator_token), timeout=30)
        assert g.status_code == 404

        # movement logged with kind=bottling_reversal and extra.original_bottling_id
        mv = requests.get(f"{API}/movements", headers=_h(operator_token),
                          params={"kind": "bottling_reversal", "limit": 50}, timeout=30)
        assert mv.status_code == 200
        found = [m for m in mv.json() if m.get("extra", {}).get("original_bottling_id") == bid]
        assert found, "bottling_reversal movement not found"
        assert found[0]["kind"] == "bottling_reversal"

    def test_cancel_cliente_only_reverses_finished(self, operator_token, admin_token):
        fin_before = _get_finished_cabernet(operator_token)
        raw_before = _get_raw(operator_token, "BOT-075-BIANCA")

        payload = {
            "supplier": "cliente",
            "client_name": "TEST_cliente_X",
            "wine_name": fin_before["name"],
            "finished_item_id": fin_before["id"],
            "bottle_count": 5,
            "bottle_capacity_l": 0.75,
            "carton_size": 6,
            "carton_count": 1,
            "materials": [
                {"raw_item_id": raw_before["id"], "quantity": 5},
            ],
            "notes": "TEST_cancel_cliente",
        }
        r = requests.post(f"{API}/bottling", json=payload, headers=_h(operator_token), timeout=30)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        # ensure materials recorded with not_deducted=true
        assert r.json()["materials"][0].get("not_deducted") is True

        # cliente: finished credited, raw NOT deducted
        fin_mid = _get_finished_cabernet(operator_token)
        raw_mid = _get_raw(operator_token, "BOT-075-BIANCA")
        assert fin_mid["quantity"] == fin_before["quantity"] + 5
        assert raw_mid["quantity"] == raw_before["quantity"]  # not deducted

        # admin cancels
        d = requests.delete(f"{API}/bottling/{bid}", headers=_h(admin_token), timeout=30)
        assert d.status_code == 200

        fin_after = _get_finished_cabernet(operator_token)
        raw_after = _get_raw(operator_token, "BOT-075-BIANCA")
        # finished reversed
        assert fin_after["quantity"] == fin_before["quantity"]
        # raw NOT re-added (since it wasn't deducted)
        assert raw_after["quantity"] == raw_before["quantity"]


# ---------- regression: scan + bottling + pdf ----------
class TestRegression:
    def test_scan_existing_barcode(self, operator_token):
        r = requests.get(f"{API}/scan/WINE-CAB-2022-A", headers=_h(operator_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["kind"] == "finished"

    def test_bottling_create_and_pdf(self, operator_token, admin_token):
        fin = _get_finished_cabernet(operator_token)
        payload = {
            "supplier": "tenuta_barbon",
            "wine_name": fin["name"],
            "finished_item_id": fin["id"],
            "bottle_count": 2,
            "bottle_capacity_l": 0.75,
            "carton_size": 6,
            "carton_count": 1,
            "materials": [],
            "notes": "TEST_regression",
        }
        r = requests.post(f"{API}/bottling", json=payload, headers=_h(operator_token), timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        pdf = requests.get(f"{API}/bottling/{bid}/pdf", headers=_h(operator_token), timeout=30)
        assert pdf.status_code == 200
        assert pdf.headers.get("content-type", "").startswith("application/pdf")
        # cleanup
        requests.delete(f"{API}/bottling/{bid}", headers=_h(admin_token), timeout=30)
