import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Info, Plus, Pencil } from "lucide-react";

const CAPACITIES = [0.20, 0.35, 0.50, 0.75, 1.50, 3.00];
const CARTON_SIZES = [6, 12, 24];

/* --------------- small reusable pieces --------------- */

function SectionCard({ title, children }) {
  return (
    <Card className="card-elevated">
      <CardContent className="p-0">
        <div className="px-5 py-2 bg-stone-200/70 border-b border-stone-300 rounded-t-lg">
          <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-stone-800">{title}</div>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function SiNo({ value, onChange, name }) {
  // value: true | false | null
  const asStr = value === true ? "si" : value === false ? "no" : "";
  return (
    <RadioGroup
      className="flex items-center gap-4"
      value={asStr}
      onValueChange={(v) => onChange(v === "si" ? true : v === "no" ? false : null)}
    >
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <RadioGroupItem value="si" data-testid={`${name}-si`} /> SI
      </label>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <RadioGroupItem value="no" data-testid={`${name}-no`} /> NO
      </label>
    </RadioGroup>
  );
}

function LabeledRow({ label, children, className = "" }) {
  return (
    <div className={`grid md:grid-cols-[180px_1fr] items-center gap-3 ${className}`}>
      <Label className="text-sm font-medium text-stone-700">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

/* --------------- main page --------------- */

export default function Imbottigliamento() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const [rawGroups, setRawGroups] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [finGroups, setFinGroups] = useState([]);
  const [finItems, setFinItems] = useState([]);
  const [editMeta, setEditMeta] = useState(null);

  const [form, setForm] = useState({
    supplier: "tenuta_barbon",
    client_name: "",
    wine_name: "",
    finished_item_id: "__new__",
    new_lot_name: "",
    finished_group_id: "",
    bottle_count: 1200,
    bottle_capacity_l: "0.75",
    carton_size: "12",
    carton_count: 100,
    notes: "",
  });
  const [materials, setMaterials] = useState({});

  // Extended paper-form fields
  const todayIso = new Date().toISOString().slice(0, 10);
  const [fd, setFd] = useState({
    azienda: "",
    data_lavoro: todayIso,
    partita_n: "",
    annata: "",
    tipologia: "",
    numero_lotto: "",
    // filtrazione
    filtrazione_tangenziale: null,
    filtrazione_microporica: "",
    dosatore_coadiuvante: null,
    dosaggio: "",
    // bottiglia
    bottiglia_fornita_da: "",
    chiusura_fornita_da: "",
    gabbietta_fornita_da: "",
    capsula_fornita_da: "",
    // etichettatura
    etichetta_fronte: null,
    etichetta_fronte_fornita_da: "",
    etichetta_retro: null,
    etichetta_retro_fornita_da: "",
    fascetta: null,
    fascetta_fornita_da: "",
    centratura_ottica: null,
    // confezionamento
    cartone_fornita_da: "",
    alveare_divisorio: null,
    alveare_fornita_da: "",
    alveare_quantita: "",
    etichetta_cartone: null,
    etichetta_cartone_fornita_da: "",
    etichetta_cartone_quantita: "",
    nastratrice: null,
    // palette
    palette: null,
    palette_fornita_da: "",
    palette_quantita_tot: "",
    palette_tipo: "",
    palette_tot: "",
    palette_sc_per: "",
    // cestoni
    cestoni: null,
    cestoni_fornita_da: "",
    cestoni_quantita: "",
    cestone_tipo: "",
    cestone_piani: 0,
    cestone_tot: "",
    cestone_bt_per: "",
    falde_pvc: null,
    falde_pvc_fornita_da: "",
    falde_pvc_quantita: "",
  });
  const sf = (k) => (v) => setFd((p) => ({ ...p, [k]: v }));

  // Load options and (if edit) the record
  useEffect(() => {
    (async () => {
      try {
        const [a, b, c, d] = await Promise.all([
          api.get("/groups", { params: { kind: "raw" } }),
          api.get("/raw-items"),
          api.get("/groups", { params: { kind: "finished" } }),
          api.get("/finished-items"),
        ]);
        setRawGroups(a.data); setRawItems(b.data); setFinGroups(c.data); setFinItems(d.data);

        if (editId) {
          const { data: rec } = await api.get(`/bottling/${editId}`);
          setEditMeta({
            operator_name: rec.operator_name, created_at: rec.created_at,
            edited_by: rec.edited_by, edited_at: rec.edited_at,
          });
          setForm({
            supplier: rec.supplier,
            client_name: rec.client_name || "",
            wine_name: rec.wine_name || "",
            finished_item_id: rec.finished_item_id || "__new__",
            new_lot_name: "",
            finished_group_id: "",
            bottle_count: rec.bottle_count,
            bottle_capacity_l: String(rec.bottle_capacity_l),
            carton_size: String(rec.carton_size),
            carton_count: rec.carton_count,
            notes: rec.notes || "",
          });
          const mats = {};
          (rec.materials || []).forEach((m) => { mats[m.raw_item_id] = m.quantity; });
          setMaterials(mats);
          if (rec.form_data) setFd((p) => ({ ...p, ...rec.form_data }));
        }
      } catch (e) { toast.error(formatApiError(e)); }
    })();
    // eslint-disable-next-line
  }, [editId]);

  // Auto-fill C/ Lavoro Azienda when supplier/client changes
  useEffect(() => {
    setFd((p) => ({
      ...p,
      azienda: form.supplier === "tenuta_barbon" ? "Tenuta Barbon" : (form.client_name || ""),
    }));
  }, [form.supplier, form.client_name]);

  // HL + suggested cartons
  const hl = useMemo(
    () => (Number(form.bottle_count) * Number(form.bottle_capacity_l)) / 100,
    [form.bottle_count, form.bottle_capacity_l]
  );
  const suggestedCartons = useMemo(
    () => Math.ceil(Number(form.bottle_count) / Number(form.carton_size || 1)),
    [form.bottle_count, form.carton_size]
  );
  useEffect(() => {
    setForm((f) => ({ ...f, carton_count: Math.ceil(f.bottle_count / (f.carton_size || 1)) }));
    // eslint-disable-next-line
  }, [form.bottle_count, form.carton_size]);

  const setMat = (id, q) => setMaterials((m) => ({ ...m, [id]: q }));

  const suggestedFor = (item) => {
    const g = rawGroups.find((g) => g.id === item.group_id);
    const name = g?.name || "";
    if (name === "Cartoni") {
      if (!item.name.includes(String(form.carton_size))) return 0;
      return suggestedCartons;
    }
    if (name === "Bottiglie vuote") {
      const capStr = Number(form.bottle_capacity_l).toString().replace(".", ",");
      if (!item.name.includes(capStr)) return 0;
      return Number(form.bottle_count);
    }
    return Number(form.bottle_count);
  };

  const applySuggestions = () => {
    const next = {};
    rawItems.forEach((it) => {
      const s = suggestedFor(it);
      if (s > 0) next[it.id] = s;
    });
    setMaterials(next);
    toast.success("Suggerimenti applicati");
  };

  const submit = async () => {
    try {
      const mats = Object.entries(materials)
        .map(([raw_item_id, quantity]) => ({ raw_item_id, quantity: Number(quantity) || 0 }))
        .filter((m) => m.quantity > 0);

      const payload = {
        supplier: form.supplier,
        client_name: form.supplier === "cliente" ? form.client_name : "",
        wine_name: form.wine_name || form.new_lot_name,
        finished_item_id: form.finished_item_id !== "__new__" ? form.finished_item_id : null,
        new_lot_name: form.finished_item_id === "__new__" ? form.new_lot_name : null,
        finished_group_id: form.finished_item_id === "__new__" ? form.finished_group_id : null,
        bottle_count: Number(form.bottle_count),
        bottle_capacity_l: Number(form.bottle_capacity_l),
        carton_size: Number(form.carton_size),
        carton_count: Number(form.carton_count),
        materials: mats,
        notes: form.notes,
        form_data: fd,
      };

      let recordId;
      if (isEdit) {
        const { data } = await api.put(`/bottling/${editId}`, payload);
        recordId = data.id;
        toast.success("Imbottigliamento modificato — magazzino aggiornato");
      } else {
        const { data } = await api.post("/bottling", payload);
        recordId = data.id;
        toast.success("Imbottigliamento registrato");
      }

      try {
        const resp = await api.get(`/bottling/${recordId}/pdf`, { responseType: "blob" });
        const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url; a.download = `imbottigliamento_${recordId}.pdf`;
        a.click(); URL.revokeObjectURL(url);
      } catch (_e) { /* ignore */ }

      if (isEdit) navigate("/cronologia");
      else {
        setMaterials({});
        setForm((f) => ({ ...f, wine_name: "", new_lot_name: "", bottle_count: 1200, notes: "" }));
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const byGroup = useMemo(() => {
    const m = {};
    rawItems.forEach((it) => {
      const g = rawGroups.find((g) => g.id === it.group_id);
      const key = g?.name || "Altri";
      if (!m[key]) m[key] = [];
      m[key].push(it);
    });
    return m;
  }, [rawItems, rawGroups]);

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="bottling-root">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Produzione</div>
        <h1 className="font-serif-display text-4xl text-stone-900 flex items-center gap-3">
          {isEdit && <Pencil className="w-7 h-7 text-amber-600" />}
          {isEdit ? "Modifica imbottigliamento" : "Modulo imbottigliamento"}
        </h1>
        {isEdit && editMeta && (
          <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-4 py-2 text-sm inline-flex items-center gap-2">
            <Info className="w-4 h-4" />
            Modifica di un modulo registrato da <b>{editMeta.operator_name}</b> il {new Date(editMeta.created_at).toLocaleString("it-IT")}
          </div>
        )}
      </div>

      {/* Supplier choice (rules deduzione magazzino) */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-3">
          <Label className="text-sm font-semibold">Chi ha fornito il materiale?</Label>
          <RadioGroup
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            value={form.supplier}
            onValueChange={(v) => setForm({ ...form, supplier: v })}
          >
            <label className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${form.supplier === "tenuta_barbon" ? "border-[#6B1D2F] bg-[#6B1D2F]/5" : "border-stone-200"}`}>
              <RadioGroupItem value="tenuta_barbon" data-testid="supplier-barbon" />
              <div>
                <div className="font-medium text-sm">Tenuta Barbon</div>
                <div className="text-xs text-stone-500">Le quantità saranno sottratte dal magazzino.</div>
              </div>
            </label>
            <label className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${form.supplier === "cliente" ? "border-sky-500 bg-sky-50" : "border-stone-200"}`}>
              <RadioGroupItem value="cliente" data-testid="supplier-cliente" />
              <div>
                <div className="font-medium text-sm">Cliente / Conto terzi</div>
                <div className="text-xs text-stone-500">Nessuna detrazione dal magazzino.</div>
              </div>
            </label>
          </RadioGroup>
          {form.supplier === "cliente" && (
            <div className="pt-1">
              <Label>Nome cliente</Label>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} data-testid="client-name-input" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Header strip + title */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-4">
          <div className="grid md:grid-cols-[2fr_1fr] gap-4">
            <div>
              <Label>C/ Lavoro Azienda</Label>
              <Input value={fd.azienda} onChange={(e) => sf("azienda")(e.target.value)} data-testid="azienda-input" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={fd.data_lavoro} onChange={(e) => sf("data_lavoro")(e.target.value)} data-testid="data-input" />
            </div>
          </div>
          <div className="text-center text-[11px] uppercase tracking-[0.14em] font-semibold text-stone-700 bg-stone-100 border border-stone-200 rounded-md py-2">
            Specifiche riguardanti le modalità dell'imbottigliamento e confezionamento
          </div>
          <div>
            <Label>Partita n°</Label>
            <Input value={fd.partita_n} onChange={(e) => sf("partita_n")(e.target.value)} data-testid="partita-input" placeholder="Es. 2026-012" />
          </div>
        </CardContent>
      </Card>

      {/* CARATTERISTICHE */}
      <SectionCard title="Caratteristiche">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Lotto destinazione</Label>
            <Select value={form.finished_item_id} onValueChange={(v) => setForm({ ...form, finished_item_id: v })}>
              <SelectTrigger data-testid="finished-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">+ Crea nuovo lotto</SelectItem>
                {finItems.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({f.quantity} bott.)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vino</Label>
            <Input
              value={form.finished_item_id === "__new__" ? form.new_lot_name : form.wine_name}
              onChange={(e) => form.finished_item_id === "__new__"
                ? setForm({ ...form, new_lot_name: e.target.value, wine_name: e.target.value })
                : setForm({ ...form, wine_name: e.target.value })}
              data-testid="wine-name"
              placeholder="Es. Cabernet Riserva — Lotto A"
            />
          </div>
          {form.finished_item_id === "__new__" && (
            <div>
              <Label>Tipologia vino (macrogruppo)</Label>
              <Select value={form.finished_group_id} onValueChange={(v) => setForm({ ...form, finished_group_id: v })}>
                <SelectTrigger data-testid="new-lot-group"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                <SelectContent>
                  {finGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Annata</Label>
            <Input value={fd.annata} onChange={(e) => sf("annata")(e.target.value)} placeholder="2024" />
          </div>
          <div>
            <Label>Tipologia</Label>
            <Input value={fd.tipologia} onChange={(e) => sf("tipologia")(e.target.value)} placeholder="DOC, DOCG, IGT…" />
          </div>
          <div>
            <Label>N° lotto</Label>
            <Input value={fd.numero_lotto} onChange={(e) => sf("numero_lotto")(e.target.value)} placeholder="Es. L2026-A" />
          </div>
          <div>
            <Label>Tot bottiglie</Label>
            <Input type="number" min="0" value={form.bottle_count} onChange={(e) => setForm({ ...form, bottle_count: e.target.value })} data-testid="bottle-count" />
          </div>
          <div>
            <Label>Ettolitri (auto)</Label>
            <div className="h-10 flex items-center font-mono-num text-[#6B1D2F] font-bold text-xl" data-testid="hl-value">{hl.toFixed(2)} HL</div>
            <div className="text-[11px] text-stone-500">({form.bottle_count} × {form.bottle_capacity_l} L) / 100</div>
          </div>
        </div>
      </SectionCard>

      {/* FILTRAZIONE */}
      <SectionCard title="Filtrazione">
        <LabeledRow label="Tangenziale">
          <SiNo name="filt-tang" value={fd.filtrazione_tangenziale} onChange={sf("filtrazione_tangenziale")} />
        </LabeledRow>
        <LabeledRow label="Microporica">
          <RadioGroup className="flex items-center gap-5" value={fd.filtrazione_microporica} onValueChange={sf("filtrazione_microporica")}>
            {["1", "0.65", "0.45"].map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <RadioGroupItem value={v} data-testid={`micro-${v}`} />
                {v.replace(".", ",")} μm
              </label>
            ))}
          </RadioGroup>
        </LabeledRow>
        <LabeledRow label="Dosatore coadiuvante (post filtrazione)">
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="dosatore" value={fd.dosatore_coadiuvante} onChange={sf("dosatore_coadiuvante")} />
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Dosaggio</Label>
              <Input className="w-40" value={fd.dosaggio} onChange={(e) => sf("dosaggio")(e.target.value)} placeholder="es. 20 g/hl" />
            </div>
          </div>
        </LabeledRow>
      </SectionCard>

      {/* BOTTIGLIA */}
      <SectionCard title="Bottiglia">
        <LabeledRow label="Capacità bottiglia">
          <Select value={String(form.bottle_capacity_l)} onValueChange={(v) => setForm({ ...form, bottle_capacity_l: v })}>
            <SelectTrigger data-testid="bottle-capacity" className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAPACITIES.map((c) => <SelectItem key={c} value={String(c)}>{c.toFixed(2)} L</SelectItem>)}
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label="Bottiglia — fornita da">
          <Input value={fd.bottiglia_fornita_da} onChange={(e) => sf("bottiglia_fornita_da")(e.target.value)} />
        </LabeledRow>
        <LabeledRow label="Chiusura — fornita da">
          <Input value={fd.chiusura_fornita_da} onChange={(e) => sf("chiusura_fornita_da")(e.target.value)} />
        </LabeledRow>
        <LabeledRow label="Gabbietta — fornita da">
          <Input value={fd.gabbietta_fornita_da} onChange={(e) => sf("gabbietta_fornita_da")(e.target.value)} />
        </LabeledRow>
        <LabeledRow label="Capsula — fornita da">
          <Input value={fd.capsula_fornita_da} onChange={(e) => sf("capsula_fornita_da")(e.target.value)} />
        </LabeledRow>
      </SectionCard>

      {/* ETICHETTATURA */}
      <SectionCard title="Etichettatura">
        {[
          ["Fronte", "etichetta_fronte", "etichetta_fronte_fornita_da"],
          ["Retro", "etichetta_retro", "etichetta_retro_fornita_da"],
          ["Fascetta", "fascetta", "fascetta_fornita_da"],
        ].map(([lbl, kBool, kText]) => (
          <LabeledRow key={kBool} label={lbl}>
            <div className="flex items-center gap-6 flex-wrap">
              <SiNo name={kBool} value={fd[kBool]} onChange={sf(kBool)} />
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Label className="text-sm text-stone-600">Fornita da</Label>
                <Input value={fd[kText]} onChange={(e) => sf(kText)(e.target.value)} />
              </div>
            </div>
          </LabeledRow>
        ))}
        <LabeledRow label="Centratura ottica">
          <SiNo name="centratura" value={fd.centratura_ottica} onChange={sf("centratura_ottica")} />
        </LabeledRow>
      </SectionCard>

      {/* CONFEZIONAMENTO */}
      <SectionCard title="Confezionamento">
        <LabeledRow label="Cartone — formato da">
          <div className="flex items-center gap-6 flex-wrap">
            <RadioGroup className="flex items-center gap-5" value={String(form.carton_size)} onValueChange={(v) => setForm({ ...form, carton_size: v })}>
              {CARTON_SIZES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <RadioGroupItem value={String(c)} data-testid={`carton-${c}`} />
                  {c}BT
                </label>
              ))}
            </RadioGroup>
            <div className="text-sm text-stone-500">Suggerimento: {suggestedCartons} cartoni</div>
          </div>
        </LabeledRow>
        <LabeledRow label="Cartone — fornita da">
          <div className="grid md:grid-cols-[1fr_200px] gap-3">
            <Input value={fd.cartone_fornita_da} onChange={(e) => sf("cartone_fornita_da")(e.target.value)} />
            <div>
              <Label className="text-[11px] text-stone-500">Quantità cartoni</Label>
              <Input type="number" min="0" value={form.carton_count} onChange={(e) => setForm({ ...form, carton_count: e.target.value })} data-testid="carton-count" />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow label="Alveare/divisorio">
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="alveare" value={fd.alveare_divisorio} onChange={sf("alveare_divisorio")} />
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Label className="text-sm text-stone-600">Fornita da</Label>
              <Input value={fd.alveare_fornita_da} onChange={(e) => sf("alveare_fornita_da")(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Quantità</Label>
              <Input className="w-28" type="number" value={fd.alveare_quantita} onChange={(e) => sf("alveare_quantita")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow label="Etichetta su cartone">
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="etcart" value={fd.etichetta_cartone} onChange={sf("etichetta_cartone")} />
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Label className="text-sm text-stone-600">Fornita da</Label>
              <Input value={fd.etichetta_cartone_fornita_da} onChange={(e) => sf("etichetta_cartone_fornita_da")(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Quantità</Label>
              <Input className="w-28" type="number" value={fd.etichetta_cartone_quantita} onChange={(e) => sf("etichetta_cartone_quantita")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow label="Nastratrice">
          <SiNo name="nastratrice" value={fd.nastratrice} onChange={sf("nastratrice")} />
        </LabeledRow>
      </SectionCard>

      {/* PALETTE */}
      <SectionCard title="Palette">
        <LabeledRow label="Palette">
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="palette" value={fd.palette} onChange={sf("palette")} />
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Quantità totale</Label>
              <Input className="w-28" type="number" value={fd.palette_quantita_tot} onChange={(e) => sf("palette_quantita_tot")(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Label className="text-sm text-stone-600">Fornita da</Label>
              <Input value={fd.palette_fornita_da} onChange={(e) => sf("palette_fornita_da")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow label="Tipologia">
          <RadioGroup className="flex items-center gap-5 flex-wrap" value={fd.palette_tipo} onValueChange={sf("palette_tipo")}>
            {[
              ["epal_80x120", "Epal 80x120"],
              ["pallet_80x120", "Pallet 80x120"],
              ["pallet_100x120", "Pallet 100x120"],
            ].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <RadioGroupItem value={v} />
                {l}
              </label>
            ))}
          </RadioGroup>
        </LabeledRow>
        <LabeledRow label="Totali">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <Label className="text-[11px] text-stone-500">tot pallet</Label>
              <Input type="number" value={fd.palette_tot} onChange={(e) => sf("palette_tot")(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] text-stone-500">sc/pallet</Label>
              <Input type="number" value={fd.palette_sc_per} onChange={(e) => sf("palette_sc_per")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
      </SectionCard>

      {/* CESTONI */}
      <SectionCard title="Cestoni">
        <LabeledRow label="Cestoni">
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="cestoni" value={fd.cestoni} onChange={sf("cestoni")} />
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Quantità</Label>
              <Input className="w-28" type="number" value={fd.cestoni_quantita} onChange={(e) => sf("cestoni_quantita")(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Label className="text-sm text-stone-600">Fornita da</Label>
              <Input value={fd.cestoni_fornita_da} onChange={(e) => sf("cestoni_fornita_da")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow label="Tipologia">
          <RadioGroup className="flex items-center gap-5 flex-wrap" value={fd.cestone_tipo} onValueChange={sf("cestone_tipo")}>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <RadioGroupItem value="cestone_epal" /> Cestone + Epal 80x120
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <RadioGroupItem value="cestone_normale" /> Cestone normale
            </label>
          </RadioGroup>
        </LabeledRow>
        <LabeledRow label="Piani">
          <RadioGroup className="flex items-center gap-5" value={String(fd.cestone_piani || "")} onValueChange={(v) => sf("cestone_piani")(Number(v))}>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value="2" /> 2 piani</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value="3" /> 3 piani</label>
          </RadioGroup>
        </LabeledRow>
        <LabeledRow label="Totali">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <Label className="text-[11px] text-stone-500">tot cestoni</Label>
              <Input type="number" value={fd.cestone_tot} onChange={(e) => sf("cestone_tot")(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] text-stone-500">bt/cestone</Label>
              <Input type="number" value={fd.cestone_bt_per} onChange={(e) => sf("cestone_bt_per")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow label="Falde pvc">
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="falde" value={fd.falde_pvc} onChange={sf("falde_pvc")} />
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Label className="text-sm text-stone-600">Fornita da</Label>
              <Input value={fd.falde_pvc_fornita_da} onChange={(e) => sf("falde_pvc_fornita_da")(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Quantità</Label>
              <Input className="w-28" type="number" value={fd.falde_pvc_quantita} onChange={(e) => sf("falde_pvc_quantita")(e.target.value)} />
            </div>
          </div>
        </LabeledRow>
      </SectionCard>

      {/* NOTE */}
      <SectionCard title="Note">
        <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Osservazioni di produzione…" />
      </SectionCard>

      {/* MATERIALE DEDOTTO DAL MAGAZZINO */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-serif-display text-xl">Materiale detratto dal magazzino</div>
              <div className="text-xs text-stone-500">Indica le quantità effettive consumate per questo imbottigliamento.</div>
            </div>
            <Button variant="outline" onClick={applySuggestions} data-testid="apply-suggestions">
              <Plus className="w-4 h-4 mr-2" /> Applica suggerimenti
            </Button>
          </div>

          {form.supplier === "cliente" && (
            <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-900 rounded-md px-3 py-2 text-sm">
              <Info className="w-4 h-4 mt-0.5" />
              Lavorazione conto terzi: nessuna detrazione dal magazzino Tenuta Barbon.
            </div>
          )}

          <div className="space-y-5">
            {Object.entries(byGroup).map(([gname, list]) => (
              <div key={gname}>
                <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">{gname}</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Articolo</TableHead>
                        <TableHead className="text-right">Scorta</TableHead>
                        <TableHead className="text-right">Suggerimento</TableHead>
                        <TableHead className="w-40">Quantità usata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((it) => {
                        const sug = suggestedFor(it);
                        const used = materials[it.id] ?? "";
                        const insufficient = form.supplier === "tenuta_barbon" && Number(used) > it.quantity;
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="font-medium">{it.name}</TableCell>
                            <TableCell className="text-right font-mono-num">{it.quantity} {it.unit}</TableCell>
                            <TableCell className="text-right font-mono-num text-stone-500">{sug > 0 ? sug : "—"}</TableCell>
                            <TableCell>
                              <Input
                                type="number" min="0" value={used}
                                onChange={(e) => setMat(it.id, e.target.value)}
                                placeholder="0"
                                className={insufficient ? "border-red-500" : ""}
                                data-testid={`mat-input-${it.name}`}
                              />
                              {insufficient && <div className="text-[10px] text-red-600 mt-1">Scorta insufficiente</div>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="p-5 flex items-center justify-between">
          <div className="text-xs text-stone-500">Al salvataggio verrà generato automaticamente il PDF riepilogativo.</div>
          <Button className="btn-wine h-11 px-6" onClick={submit} data-testid="bottling-submit-button">
            <FileText className="w-4 h-4 mr-2" /> {isEdit ? "Salva modifiche" : "Salva imbottigliamento"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
