from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

# ---------- Mongo ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="Tenuta Barbon WMS")
api = APIRouter(prefix="/api")

# ---------- JWT ----------
JWT_ALGORITHM = "HS256"

def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email, "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token non valido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Richiede privilegi admin")
    return user

# ---------- Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class OperatorIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "operator"] = "operator"

class GroupIn(BaseModel):
    name: str
    kind: Literal["raw", "finished"]
    description: Optional[str] = ""

class RawItemIn(BaseModel):
    group_id: str
    name: str
    quantity: float = 0
    unit: str = "pz"
    min_threshold: float = 0
    notes: Optional[str] = ""

class FinishedItemIn(BaseModel):
    group_id: str
    name: str           # lot/partita name (e.g. Cabernet 2022 - Lotto A)
    quantity: float = 0
    unit: str = "bott."
    min_threshold: float = 0
    bottle_capacity_l: Optional[float] = 0.75
    notes: Optional[str] = ""

class StockAdjustIn(BaseModel):
    quantity_delta: float
    reason: str = "Rettifica manuale"

class BottlingMaterial(BaseModel):
    raw_item_id: str
    quantity: float

class BottlingIn(BaseModel):
    supplier: Literal["tenuta_barbon", "cliente"]
    client_name: Optional[str] = ""
    wine_name: str
    finished_item_id: Optional[str] = None   # existing lot to credit
    new_lot_name: Optional[str] = None       # or new lot
    finished_group_id: Optional[str] = None  # required if new_lot_name
    bottle_count: int
    bottle_capacity_l: float                 # one of 0.20..3.00
    carton_size: int                         # 6/12/24
    carton_count: int                        # editable
    materials: List[BottlingMaterial] = []   # all raw items used (editable)
    notes: Optional[str] = ""

# ---------- Helpers ----------
def oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=400, detail=f"ID non valido: {s}")

def serialize(doc: dict) -> dict:
    if not doc:
        return doc
    doc["id"] = str(doc["_id"])
    doc.pop("_id", None)
    return doc

async def log_movement(
    operator: dict,
    kind: str,
    item_kind: str,
    item_id: Optional[str],
    item_name: str,
    quantity_delta: float,
    reason: str,
    extra: Optional[dict] = None,
):
    doc = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operator_id": operator["id"],
        "operator_name": operator.get("name", operator["email"]),
        "operator_email": operator["email"],
        "kind": kind,                   # 'stock_adjust', 'bottling', 'item_create', 'item_delete'
        "item_kind": item_kind,         # 'raw', 'finished', 'bottling'
        "item_id": item_id,
        "item_name": item_name,
        "quantity_delta": quantity_delta,
        "reason": reason,
        "extra": extra or {},
    }
    await db.movements.insert_one(doc)

# ---------- Auth routes ----------
@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    response.set_cookie(
        "access_token", token, httponly=True, secure=True, samesite="none",
        max_age=43200, path="/"
    )
    return {
        "token": token,
        "user": {
            "id": uid, "email": email,
            "name": user.get("name", ""), "role": user.get("role", "operator"),
        },
    }

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.get("/auth/operators")
async def list_operators(_: dict = Depends(get_current_user)):
    cur = db.users.find({}, {"password_hash": 0}).sort("created_at", 1)
    out = []
    async for u in cur:
        u["id"] = str(u["_id"]); u.pop("_id", None)
        out.append(u)
    return out

@api.post("/auth/operators")
async def create_operator(data: OperatorIn, admin: dict = Depends(require_admin)):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email già registrata")
    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": data.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.users.insert_one(doc)
    return {"id": str(r.inserted_id), "email": email, "name": data.name, "role": data.role}

@api.delete("/auth/operators/{op_id}")
async def delete_operator(op_id: str, admin: dict = Depends(require_admin)):
    if op_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Non puoi eliminare te stesso")
    r = await db.users.delete_one({"_id": oid(op_id)})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Operatore non trovato")
    return {"ok": True}

# ---------- Groups ----------
@api.get("/groups")
async def list_groups(kind: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {}
    if kind:
        q["kind"] = kind
    cur = db.groups.find(q).sort("name", 1)
    out = []
    async for g in cur:
        out.append(serialize(g))
    return out

@api.post("/groups")
async def create_group(data: GroupIn, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.groups.insert_one(doc)
    doc.pop("_id", None)
    doc["id"] = str(r.inserted_id)
    return doc

@api.delete("/groups/{gid}")
async def delete_group(gid: str, user: dict = Depends(get_current_user)):
    g = await db.groups.find_one({"_id": oid(gid)})
    if not g:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    coll = "raw_items" if g["kind"] == "raw" else "finished_items"
    cnt = await db[coll].count_documents({"group_id": gid})
    if cnt:
        raise HTTPException(status_code=400, detail="Gruppo non vuoto")
    await db.groups.delete_one({"_id": oid(gid)})
    return {"ok": True}

# ---------- Raw items ----------
@api.get("/raw-items")
async def list_raw(group_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {}
    if group_id:
        q["group_id"] = group_id
    cur = db.raw_items.find(q).sort("name", 1)
    out = []
    async for d in cur:
        out.append(serialize(d))
    return out

@api.post("/raw-items")
async def create_raw(data: RawItemIn, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.raw_items.insert_one(doc)
    doc.pop("_id", None)
    doc["id"] = str(r.inserted_id)
    await log_movement(user, "item_create", "raw", doc["id"], doc["name"],
                       doc["quantity"], "Creazione articolo")
    return doc

@api.put("/raw-items/{iid}")
async def update_raw(iid: str, data: RawItemIn, user: dict = Depends(get_current_user)):
    update = data.model_dump()
    r = await db.raw_items.update_one({"_id": oid(iid)}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    doc = await db.raw_items.find_one({"_id": oid(iid)})
    return serialize(doc)

@api.post("/raw-items/{iid}/adjust")
async def adjust_raw(iid: str, data: StockAdjustIn, user: dict = Depends(get_current_user)):
    doc = await db.raw_items.find_one({"_id": oid(iid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    new_q = (doc.get("quantity") or 0) + data.quantity_delta
    await db.raw_items.update_one({"_id": oid(iid)}, {"$set": {"quantity": new_q}})
    await log_movement(user, "stock_adjust", "raw", iid, doc["name"],
                       data.quantity_delta, data.reason)
    doc["quantity"] = new_q
    return serialize(doc)

@api.delete("/raw-items/{iid}")
async def delete_raw(iid: str, user: dict = Depends(get_current_user)):
    doc = await db.raw_items.find_one({"_id": oid(iid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    await db.raw_items.delete_one({"_id": oid(iid)})
    await log_movement(user, "item_delete", "raw", iid, doc["name"], 0, "Eliminazione articolo")
    return {"ok": True}

# ---------- Finished items ----------
@api.get("/finished-items")
async def list_finished(group_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {}
    if group_id:
        q["group_id"] = group_id
    cur = db.finished_items.find(q).sort("name", 1)
    out = []
    async for d in cur:
        out.append(serialize(d))
    return out

@api.post("/finished-items")
async def create_finished(data: FinishedItemIn, user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.finished_items.insert_one(doc)
    doc.pop("_id", None)
    doc["id"] = str(r.inserted_id)
    await log_movement(user, "item_create", "finished", doc["id"], doc["name"],
                       doc["quantity"], "Creazione lotto")
    return doc

@api.put("/finished-items/{iid}")
async def update_finished(iid: str, data: FinishedItemIn, user: dict = Depends(get_current_user)):
    r = await db.finished_items.update_one({"_id": oid(iid)}, {"$set": data.model_dump()})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Lotto non trovato")
    doc = await db.finished_items.find_one({"_id": oid(iid)})
    return serialize(doc)

@api.post("/finished-items/{iid}/adjust")
async def adjust_finished(iid: str, data: StockAdjustIn, user: dict = Depends(get_current_user)):
    doc = await db.finished_items.find_one({"_id": oid(iid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Lotto non trovato")
    new_q = (doc.get("quantity") or 0) + data.quantity_delta
    await db.finished_items.update_one({"_id": oid(iid)}, {"$set": {"quantity": new_q}})
    await log_movement(user, "stock_adjust", "finished", iid, doc["name"],
                       data.quantity_delta, data.reason)
    doc["quantity"] = new_q
    return serialize(doc)

@api.delete("/finished-items/{iid}")
async def delete_finished(iid: str, user: dict = Depends(get_current_user)):
    doc = await db.finished_items.find_one({"_id": oid(iid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Lotto non trovato")
    await db.finished_items.delete_one({"_id": oid(iid)})
    await log_movement(user, "item_delete", "finished", iid, doc["name"], 0, "Eliminazione lotto")
    return {"ok": True}

# ---------- Dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(_: dict = Depends(get_current_user)):
    raws = [serialize(d) async for d in db.raw_items.find({})]
    finis = [serialize(d) async for d in db.finished_items.find({})]
    low_raw = [r for r in raws if (r.get("min_threshold") or 0) > 0 and (r.get("quantity") or 0) <= (r.get("min_threshold") or 0)]
    low_fin = [r for r in finis if (r.get("min_threshold") or 0) > 0 and (r.get("quantity") or 0) <= (r.get("min_threshold") or 0)]
    total_bottles = sum((f.get("quantity") or 0) for f in finis)
    total_hl = sum(((f.get("quantity") or 0) * (f.get("bottle_capacity_l") or 0)) / 100 for f in finis)
    # Count bottling this month
    now = datetime.now(timezone.utc)
    start_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
    bot_count = await db.bottling_records.count_documents({"created_at": {"$gte": start_month}})
    return {
        "raw_total": len(raws),
        "finished_total": len(finis),
        "low_raw": low_raw,
        "low_finished": low_fin,
        "total_bottles": total_bottles,
        "total_hl": round(total_hl, 2),
        "bottling_this_month": bot_count,
    }

# ---------- Bottling ----------
@api.get("/bottling")
async def list_bottling(limit: int = 100, _: dict = Depends(get_current_user)):
    cur = db.bottling_records.find({}).sort("created_at", -1).limit(limit)
    out = []
    async for d in cur:
        out.append(serialize(d))
    return out

@api.get("/bottling/{bid}")
async def get_bottling(bid: str, _: dict = Depends(get_current_user)):
    doc = await db.bottling_records.find_one({"_id": oid(bid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Record non trovato")
    return serialize(doc)

@api.post("/bottling")
async def create_bottling(data: BottlingIn, user: dict = Depends(get_current_user)):
    # 1) Compute HL
    hl = round((data.bottle_count * data.bottle_capacity_l) / 100.0, 4)

    # 2) Resolve finished item (existing or new lot)
    finished_item_id = data.finished_item_id
    finished_name = data.wine_name
    if not finished_item_id:
        if not (data.new_lot_name and data.finished_group_id):
            raise HTTPException(status_code=400, detail="Specificare lotto esistente o nuovo lotto + gruppo")
        new_doc = {
            "group_id": data.finished_group_id,
            "name": data.new_lot_name,
            "quantity": 0,
            "unit": "bott.",
            "min_threshold": 0,
            "bottle_capacity_l": data.bottle_capacity_l,
            "notes": f"Creato da imbottigliamento",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        r = await db.finished_items.insert_one(new_doc)
        finished_item_id = str(r.inserted_id)
        finished_name = data.new_lot_name

    # 3) Credit finished product with bottles
    await db.finished_items.update_one(
        {"_id": oid(finished_item_id)},
        {"$inc": {"quantity": data.bottle_count}}
    )

    # 4) Decrement raw materials ONLY if supplier == tenuta_barbon
    materials_log = []
    if data.supplier == "tenuta_barbon":
        for m in data.materials:
            if m.quantity <= 0:
                continue
            raw = await db.raw_items.find_one({"_id": oid(m.raw_item_id)})
            if not raw:
                continue
            await db.raw_items.update_one(
                {"_id": oid(m.raw_item_id)},
                {"$inc": {"quantity": -m.quantity}}
            )
            materials_log.append({
                "raw_item_id": m.raw_item_id,
                "name": raw["name"],
                "quantity": m.quantity,
            })
    else:
        # Record materials but don't decrement
        for m in data.materials:
            if m.quantity <= 0:
                continue
            raw = await db.raw_items.find_one({"_id": oid(m.raw_item_id)})
            materials_log.append({
                "raw_item_id": m.raw_item_id,
                "name": raw["name"] if raw else "",
                "quantity": m.quantity,
                "not_deducted": True,
            })

    # 5) Save bottling record
    record = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operator_id": user["id"],
        "operator_name": user.get("name", user["email"]),
        "supplier": data.supplier,
        "client_name": data.client_name or "",
        "wine_name": finished_name,
        "finished_item_id": finished_item_id,
        "bottle_count": data.bottle_count,
        "bottle_capacity_l": data.bottle_capacity_l,
        "hl": hl,
        "carton_size": data.carton_size,
        "carton_count": data.carton_count,
        "materials": materials_log,
        "notes": data.notes or "",
    }
    r = await db.bottling_records.insert_one(record)
    record_id = str(r.inserted_id)
    record.pop("_id", None)
    record["id"] = record_id

    # 6) Movement log
    await log_movement(
        user, "bottling", "finished", finished_item_id, finished_name,
        data.bottle_count,
        f"Imbottigliamento — {data.bottle_count} bott. × {data.bottle_capacity_l}L = {hl} HL",
        extra={
            "bottling_id": record_id,
            "supplier": data.supplier,
            "deducted": data.supplier == "tenuta_barbon",
            "materials": materials_log,
        },
    )
    return record

@api.get("/bottling/{bid}/pdf")
async def bottling_pdf(bid: str, _: dict = Depends(get_current_user)):
    doc = await db.bottling_records.find_one({"_id": oid(bid)})
    if not doc:
        raise HTTPException(status_code=404, detail="Record non trovato")

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=18*mm, bottomMargin=18*mm,
                            leftMargin=18*mm, rightMargin=18*mm)
    styles = getSampleStyleSheet()
    burgundy = colors.HexColor("#6B1D2F")
    stone = colors.HexColor("#1C1917")
    muted = colors.HexColor("#78716C")

    title_style = ParagraphStyle("Title", parent=styles["Title"],
                                 textColor=burgundy, fontName="Helvetica-Bold",
                                 fontSize=22, spaceAfter=4)
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], textColor=muted,
                               fontSize=10, spaceAfter=14)
    section_style = ParagraphStyle("Section", parent=styles["Heading2"],
                                   textColor=stone, fontSize=13, spaceBefore=12, spaceAfter=6)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, textColor=stone)

    story = []
    story.append(Paragraph("TENUTA BARBON", title_style))
    story.append(Paragraph("Modulo Imbottigliamento — Riepilogo", sub_style))

    created = doc.get("created_at", "")
    try:
        created_pretty = datetime.fromisoformat(created).strftime("%d/%m/%Y %H:%M")
    except Exception:
        created_pretty = created

    info = [
        ["Data", created_pretty],
        ["Operatore", doc.get("operator_name", "")],
        ["Fornitore", "Tenuta Barbon" if doc.get("supplier") == "tenuta_barbon" else f"Cliente — {doc.get('client_name','')}"],
        ["Prodotto", doc.get("wine_name", "")],
        ["Bottiglie prodotte", str(doc.get("bottle_count", 0))],
        ["Capacità bottiglia", f"{doc.get('bottle_capacity_l', 0)} L"],
        ["Ettolitri utilizzati", f"{doc.get('hl', 0)} HL"],
        ["Formato cartone", f"{doc.get('carton_size', 0)} bott."],
        ["Cartoni utilizzati", str(doc.get("carton_count", 0))],
    ]
    t = Table(info, colWidths=[55*mm, 115*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FAF7F2")),
        ("TEXTCOLOR", (0, 0), (0, -1), muted),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 10),
        ("FONT", (1, 0), (1, -1), "Helvetica", 10),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E7E5E4")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E7E5E4")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    story.append(Paragraph("Materiale di confezionamento", section_style))
    mats = doc.get("materials", []) or []
    if mats:
        rows = [["Articolo", "Quantità", "Note"]]
        for m in mats:
            rows.append([
                m.get("name", ""),
                str(m.get("quantity", 0)),
                "Non detratto (cliente)" if m.get("not_deducted") else "Detratto dal magazzino",
            ])
        mt = Table(rows, colWidths=[80*mm, 30*mm, 60*mm])
        mt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), burgundy),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E7E5E4")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E7E5E4")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(mt)
    else:
        story.append(Paragraph("Nessun materiale registrato.", body_style))

    if doc.get("notes"):
        story.append(Paragraph("Note", section_style))
        story.append(Paragraph(doc["notes"], body_style))

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "Documento generato automaticamente da Tenuta Barbon WMS", sub_style))

    pdf.build(story)
    buf.seek(0)
    headers = {
        "Content-Disposition": f'attachment; filename="imbottigliamento_{bid}.pdf"',
    }
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)

# ---------- Movements ----------
@api.get("/movements")
async def list_movements(
    limit: int = 500,
    operator_id: Optional[str] = None,
    kind: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q = {}
    if operator_id:
        q["operator_id"] = operator_id
    if kind:
        q["kind"] = kind
    cur = db.movements.find(q).sort("created_at", -1).limit(limit)
    out = []
    async for d in cur:
        out.append(serialize(d))
    return out

# ---------- Startup: indexes, admin seed, demo data ----------
async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "email": email,
            "password_hash": hash_password(pw),
            "name": "Luca Barbon",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})

async def seed_demo():
    if await db.groups.count_documents({}) > 0:
        return
    raw_groups = [
        ("Bottiglie vuote", "Vetro vuoto per imbottigliamento"),
        ("Capsule", "Capsule termoretraibili e stagnola"),
        ("Etichette", "Etichette e retroetichette"),
        ("Tappi", "Tappi in sughero e sintetici"),
        ("Cartoni", "Cartoni da imballaggio"),
    ]
    fin_groups = [
        ("Vini Rossi", "Rossi fermi"),
        ("Vini Bianchi", "Bianchi fermi"),
        ("Vini Rosati", "Rosati"),
        ("Spumanti", "Metodo classico e Charmat"),
    ]
    raw_ids = {}
    for name, desc in raw_groups:
        r = await db.groups.insert_one({
            "name": name, "kind": "raw", "description": desc,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        raw_ids[name] = str(r.inserted_id)
    fin_ids = {}
    for name, desc in fin_groups:
        r = await db.groups.insert_one({
            "name": name, "kind": "finished", "description": desc,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        fin_ids[name] = str(r.inserted_id)

    now = datetime.now(timezone.utc).isoformat()
    # Raw items
    raw_items = [
        (raw_ids["Bottiglie vuote"], "Bordolese 0,75 L verde", 2400, "pz", 500),
        (raw_ids["Bottiglie vuote"], "Bordolese 0,75 L bianca", 1800, "pz", 500),
        (raw_ids["Bottiglie vuote"], "Renana 0,75 L", 1200, "pz", 400),
        (raw_ids["Bottiglie vuote"], "Magnum 1,50 L", 180, "pz", 50),
        (raw_ids["Bottiglie vuote"], "Mignon 0,20 L", 420, "pz", 100),
        (raw_ids["Capsule"], "Capsula rossa 30×60", 3500, "pz", 500),
        (raw_ids["Capsule"], "Capsula bordeaux 30×60", 60, "pz", 300),
        (raw_ids["Capsule"], "Capsula oro 30×60", 1200, "pz", 300),
        (raw_ids["Etichette"], "Etichetta Cabernet Riserva", 1500, "pz", 300),
        (raw_ids["Etichette"], "Etichetta Prosecco Brut", 2200, "pz", 400),
        (raw_ids["Etichette"], "Retroetichetta universale", 4500, "pz", 500),
        (raw_ids["Tappi"], "Tappo sughero 44×24", 2800, "pz", 500),
        (raw_ids["Tappi"], "Tappo sintetico", 1900, "pz", 400),
        (raw_ids["Cartoni"], "Cartone 6 bott.", 320, "pz", 60),
        (raw_ids["Cartoni"], "Cartone 12 bott.", 180, "pz", 40),
        (raw_ids["Cartoni"], "Cartone 24 bott.", 40, "pz", 20),
    ]
    for g, n, q, u, m in raw_items:
        await db.raw_items.insert_one({
            "group_id": g, "name": n, "quantity": q, "unit": u,
            "min_threshold": m, "notes": "", "created_at": now,
        })

    fin_items = [
        (fin_ids["Vini Rossi"], "Cabernet Riserva 2022 — Lotto A", 820, 0.75, 100),
        (fin_ids["Vini Rossi"], "Merlot 2023 — Lotto B", 1240, 0.75, 150),
        (fin_ids["Vini Bianchi"], "Chardonnay 2024 — Lotto C", 980, 0.75, 100),
        (fin_ids["Vini Bianchi"], "Pinot Grigio 2024 — Lotto D", 60, 0.75, 150),
        (fin_ids["Vini Rosati"], "Rosato Veneto 2024 — Lotto E", 420, 0.75, 80),
        (fin_ids["Spumanti"], "Prosecco Brut 2024 — Lotto F", 1500, 0.75, 200),
    ]
    for g, n, q, cap, m in fin_items:
        await db.finished_items.insert_one({
            "group_id": g, "name": n, "quantity": q, "unit": "bott.",
            "min_threshold": m, "bottle_capacity_l": cap, "notes": "",
            "created_at": now,
        })

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.movements.create_index([("created_at", -1)])
    await db.bottling_records.create_index([("created_at", -1)])
    await seed_admin()
    await seed_demo()

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------- Health ----------
@api.get("/")
async def root():
    return {"service": "Tenuta Barbon WMS", "ok": True}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if os.environ.get("CORS_ORIGINS", "*") == "*" else os.environ["CORS_ORIGINS"].split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
