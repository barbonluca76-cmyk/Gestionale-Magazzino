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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { FileText, Info, Pencil } from "lucide-react";

const CAPACITIES = [0.20, 0.35, 0.50, 0.75, 1.50, 3.00];
const CARTON_SIZES = [6, 12, 24];
const MICRO_OPTIONS = [
  { v: "1", l: "1 μm" },
  { v: "0.65", l: "0,65 μm" },
  { v: "0.45", l: "0,45 μm" },
];

/* -------- building blocks -------- */
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
  const asStr = value === true ? "si" : value === false ? "no" : "";
  return (
    <RadioGroup className="flex items-center gap-4" value={asStr}
      onValueChange={(v) => onChange(v === "si" ? true : v === "no" ? false : null)}>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <RadioGroupItem value="si" data-testid={`${name}-si`} /> SI
      </label>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <RadioGroupItem value="no" data-testid={`${name}-no`} /> NO
      </label>
    </RadioGroup>
  );
}

/* Reusable component row: [check] [select+manual OR manual-only] [fornita_da] [optional qty] */
function ComponentRow({ label, cmp, onChange, options, autoFillSupplier, showQty, autoQty, manualOnly = false }) {
  const isManual = cmp.art_id === "__manual__";
  const setK = (k, v) => onChange({ ...cmp, [k]: v });
  // Auto-populate quantity visibly when checkbox is ticked and field is empty
  const onToggleUsed = (v) => {
    const next = { ...cmp, used: !!v };
    if (v && showQty && (next.quantity === "" || next.quantity === undefined || next.quantity === null) && autoQty) {
      next.quantity = autoQty;
    }
    onChange(next);
  };
  return (
    <div className="grid md:grid-cols-[20px_140px_1fr_1fr_120px] items-start gap-3 py-2 border-b border-stone-100 last:border-0">
      <div className="pt-2">
        <Checkbox
          checked={!!cmp.used}
          onCheckedChange={onToggleUsed}
          data-testid={`cmp-${label}-used`}
        />
      </div>
      <Label className="pt-2 text-sm font-medium text-stone-700">{label}</Label>
      <div className="space-y-2">
        {manualOnly ? (
          <Input
            value={cmp.manual_name || ""}
            onChange={(e) => { setK("manual_name", e.target.value); if (!cmp.art_id) setK("art_id", "__manual__"); }}
            placeholder="Nome articolo"
            data-testid={`cmp-${label}-manual`}
          />
        ) : (
          <>
            <Select value={cmp.art_id || ""} onValueChange={(v) => setK("art_id", v)}>
              <SelectTrigger data-testid={`cmp-${label}-art`}>
                <SelectValue placeholder="Scegli dal magazzino…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}{o.quantity !== undefined ? ` — ${o.quantity} in scorta` : ""}
                  </SelectItem>
                ))}
                <SelectItem value="__manual__">+ Inserisci manualmente</SelectItem>
              </SelectContent>
            </Select>
            {isManual && (
              <Input value={cmp.manual_name || ""} onChange={(e) => setK("manual_name", e.target.value)}
                placeholder="Nome articolo (manuale)" />
            )}
          </>
        )}
      </div>
      <Input value={cmp.fornita_da || ""} onChange={(e) => setK("fornita_da", e.target.value)}
        placeholder={autoFillSupplier ? "Tenuta Barbon" : "Fornita da…"} />
      {showQty ? (
        <Input type="number" min="0"
          value={cmp.quantity ?? ""}
          onChange={(e) => setK("quantity", e.target.value)}
          placeholder={autoQty ? String(autoQty) : "Quantità"}
          data-testid={`cmp-${label}-qty`}
        />
      ) : <div />}
    </div>
  );
}

/* -------- page -------- */
export default function Imbottigliamento() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const [rawGroups, setRawGroups] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [finGroups, setFinGroups] = useState([]);
  const [editMeta, setEditMeta] = useState(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    supplier: "tenuta_barbon",
    client_name: "",
    wine_name: "",
    finished_group_id: "",
    bottle_count: 1200,
    bottle_capacity_l: "0.75",
    carton_size: "12",
    carton_count: 100,
    notes: "",
  });

  const emptyCmp = { used: false, art_id: "", manual_name: "", fornita_da: "", quantity: "" };
  const [fd, setFd] = useState({
    azienda: "",
    data_lavoro: todayIso,
    annata: "",
    tipologia: "",
    numero_lotto: "",
    // filtrazione
    filtrazione_tangenziale: null,
    filtrazione_microporica: [], // multi
    dosatore_coadiuvante: null,
    dosaggio: "",
    // componenti bottiglia (Tappo rimosso)
    bottiglia: { ...emptyCmp },
    chiusura: { ...emptyCmp },
    gabbietta: { ...emptyCmp },
    capsula: { ...emptyCmp },
    // etichettatura
    etichetta_fronte: { ...emptyCmp },
    etichetta_retro: { ...emptyCmp },
    fascetta: { ...emptyCmp },
    centratura_ottica: null,
    // confezionamento
    cartone: { ...emptyCmp },
    alveare: { ...emptyCmp },
    etichetta_cartone: { ...emptyCmp },
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
  const setCmp = (k) => (next) => setFd((p) => ({ ...p, [k]: next }));

  useEffect(() => {
    (async () => {
      try {
        const [a, b, c] = await Promise.all([
          api.get("/groups", { params: { kind: "raw" } }),
          api.get("/raw-items"),
          api.get("/groups", { params: { kind: "finished" } }),
        ]);
        setRawGroups(a.data); setRawItems(b.data); setFinGroups(c.data);

        if (editId) {
          const { data: rec } = await api.get(`/bottling/${editId}`);
          setEditMeta({
            operator_name: rec.operator_name, created_at: rec.created_at,
            edited_by: rec.edited_by, edited_at: rec.edited_at,
          });
          setForm((p) => ({
            ...p,
            supplier: rec.supplier,
            client_name: rec.client_name || "",
            wine_name: rec.wine_name || "",
            finished_group_id: rec.form_data?._group_id || "",
            bottle_count: rec.bottle_count,
            bottle_capacity_l: String(rec.bottle_capacity_l),
            carton_size: String(rec.carton_size),
            carton_count: rec.carton_count,
            notes: rec.notes || "",
          }));
          if (rec.form_data) setFd((p) => ({ ...p, ...rec.form_data }));
        }
      } catch (e) { toast.error(formatApiError(e)); }
    })();
    // eslint-disable-next-line
  }, [editId]);

  // Supplier auto-fill of "fornita da" on all component rows
  useEffect(() => {
    const value = form.supplier === "tenuta_barbon" ? "Tenuta Barbon" : "";
    setFd((p) => {
      const next = { ...p, azienda: form.supplier === "tenuta_barbon" ? "Tenuta Barbon" : (form.client_name || "") };
      ["bottiglia","chiusura","gabbietta","capsula",
       "etichetta_fronte","etichetta_retro","fascetta",
       "cartone","alveare","etichetta_cartone"].forEach((k) => {
        next[k] = { ...(p[k] || emptyCmp), fornita_da: value };
      });
      next.palette_fornita_da = value;
      next.cestoni_fornita_da = value;
      next.falde_pvc_fornita_da = value;
      return next;
    });
    // eslint-disable-next-line
  }, [form.supplier, form.client_name]);

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

  // Options for component dropdowns (filtered by raw-group name)
  const optionsByGroup = (groupNames) => {
    const ids = rawGroups.filter((g) => groupNames.includes(g.name)).map((g) => g.id);
    return rawItems.filter((it) => ids.includes(it.group_id));
  };
  const optBottles = optionsByGroup(["Bottiglie vuote"]);
  const optCaps = optionsByGroup(["Capsule"]);
  const optTappi = optionsByGroup(["Tappi"]);
  const optLabels = optionsByGroup(["Etichette"]);
  const optCartons = optionsByGroup(["Cartoni"]);
  const optGabbietta = optionsByGroup(["Gabbietta"]);
  const optAlveare = optionsByGroup(["Alveare/divisorio"]);
  const optAll = rawItems;

  const submit = async () => {
    try {
      if (!form.wine_name.trim()) { toast.error("Inserisci il nome del vino"); return; }
      if (!form.finished_group_id) { toast.error("Seleziona la tipologia (macrogruppo)"); return; }

      // Build materials[] from inline rows for inventory deduction (per-row deduct flag by fornita_da)
      const bottles = Number(form.bottle_count);
      const cartons = Number(form.carton_count);
      const rowsForBottles = ["bottiglia","chiusura","gabbietta","capsula",
                              "etichetta_fronte","etichetta_retro","fascetta"];
      const rowsForCartons = ["cartone","alveare","etichetta_cartone"];
      const isTenuta = (s) => (s || "").trim().toLowerCase() === "tenuta barbon";
      const materials = [];
      rowsForBottles.forEach((k) => {
        const c = fd[k];
        if (c?.used && c.art_id && c.art_id !== "__manual__") {
          const qty = Number(c.quantity) > 0 ? Number(c.quantity) : bottles;
          materials.push({ raw_item_id: c.art_id, quantity: qty, deduct: isTenuta(c.fornita_da) });
        }
      });
      rowsForCartons.forEach((k) => {
        const c = fd[k];
        if (c?.used && c.art_id && c.art_id !== "__manual__") {
          const qty = Number(c.quantity) > 0 ? Number(c.quantity) : cartons;
          materials.push({ raw_item_id: c.art_id, quantity: qty, deduct: isTenuta(c.fornita_da) });
        }
      });

      // Snapshot of readable component names in form_data (for PDF)
      const resolveName = (c, opts) =>
        c?.art_id === "__manual__" ? (c.manual_name || "") :
        (opts.find((o) => o.id === c?.art_id)?.name || "");
      const form_data = {
        ...fd,
        _group_id: form.finished_group_id,
        bottiglia_fornita_da: fd.bottiglia?.fornita_da || "",
        bottiglia_articolo: resolveName(fd.bottiglia, optBottles.length ? optBottles : optAll),
        tappo_articolo: resolveName(fd.tappo, optTappi),
        chiusura_articolo: resolveName(fd.chiusura, optTappi),
        chiusura_fornita_da: fd.chiusura?.fornita_da || "",
        gabbietta_articolo: resolveName(fd.gabbietta, optGabbietta),
        gabbietta_fornita_da: fd.gabbietta?.fornita_da || "",
        capsula_articolo: resolveName(fd.capsula, optCaps),
        capsula_fornita_da: fd.capsula?.fornita_da || "",
        etichetta_fronte: !!fd.etichetta_fronte?.used,
        etichetta_fronte_fornita_da: fd.etichetta_fronte?.fornita_da || "",
        etichetta_fronte_articolo: resolveName(fd.etichetta_fronte, optLabels),
        etichetta_fronte_quantita: fd.etichetta_fronte?.quantity ?? "",
        etichetta_retro: !!fd.etichetta_retro?.used,
        etichetta_retro_fornita_da: fd.etichetta_retro?.fornita_da || "",
        etichetta_retro_articolo: resolveName(fd.etichetta_retro, optLabels),
        etichetta_retro_quantita: fd.etichetta_retro?.quantity ?? "",
        fascetta: !!fd.fascetta?.used,
        fascetta_fornita_da: fd.fascetta?.fornita_da || "",
        fascetta_articolo: resolveName(fd.fascetta, optLabels),
        fascetta_quantita: fd.fascetta?.quantity ?? "",
        cartone_fornita_da: fd.cartone?.fornita_da || "",
        cartone_articolo: resolveName(fd.cartone, optCartons),
        alveare_divisorio: !!fd.alveare?.used,
        alveare_fornita_da: fd.alveare?.fornita_da || "",
        alveare_articolo: resolveName(fd.alveare, optAlveare),
        alveare_quantita: fd.alveare?.quantity ?? "",
        etichetta_cartone: !!fd.etichetta_cartone?.used,
        etichetta_cartone_fornita_da: fd.etichetta_cartone?.fornita_da || "",
        etichetta_cartone_articolo: fd.etichetta_cartone?.manual_name || "",
        etichetta_cartone_quantita: fd.etichetta_cartone?.quantity ?? "",
      };

      const payload = {
        supplier: form.supplier,
        client_name: form.supplier === "cliente" ? form.client_name : "",
        wine_name: form.wine_name,
        finished_item_id: null,
        new_lot_name: form.wine_name,
        finished_group_id: form.finished_group_id,
        bottle_count: bottles,
        bottle_capacity_l: Number(form.bottle_capacity_l),
        carton_size: Number(form.carton_size),
        carton_count: cartons,
        materials,
        notes: form.notes,
        form_data,
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
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const supplierIsBarbon = form.supplier === "tenuta_barbon";
  const bottleQty = Number(form.bottle_count) || 0;

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

      {/* Supplier */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-3">
          <Label className="text-sm font-semibold">Chi ha fornito il materiale?</Label>
          <RadioGroup className="grid grid-cols-1 md:grid-cols-2 gap-3"
            value={form.supplier} onValueChange={(v) => setForm({ ...form, supplier: v })}>
            <label className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${supplierIsBarbon ? "border-[#6B1D2F] bg-[#6B1D2F]/5" : "border-stone-200"}`}>
              <RadioGroupItem value="tenuta_barbon" data-testid="supplier-barbon" />
              <div>
                <div className="font-medium text-sm">Tenuta Barbon</div>
                <div className="text-xs text-stone-500">I campi "Fornita da" verranno compilati automaticamente.</div>
              </div>
            </label>
            <label className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${form.supplier === "cliente" ? "border-sky-500 bg-sky-50" : "border-stone-200"}`}>
              <RadioGroupItem value="cliente" data-testid="supplier-cliente" />
              <div>
                <div className="font-medium text-sm">Cliente / Conto terzi</div>
                <div className="text-xs text-stone-500">Nessuna detrazione dal magazzino. Scrivi tu i fornitori.</div>
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

      {/* Header strip */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-4">
          <div className="grid md:grid-cols-[2fr_1fr] gap-4">
            <div>
              <Label>C/ Lavoro Azienda</Label>
              <Input value={fd.azienda} onChange={(e) => sf("azienda")(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={fd.data_lavoro} onChange={(e) => sf("data_lavoro")(e.target.value)} />
            </div>
          </div>
          <div className="text-center text-[11px] uppercase tracking-[0.14em] font-semibold text-stone-700 bg-stone-100 border border-stone-200 rounded-md py-2">
            Specifiche riguardanti le modalità dell'imbottigliamento e confezionamento
          </div>
        </CardContent>
      </Card>

      {/* CARATTERISTICHE */}
      <SectionCard title="Caratteristiche">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Vino</Label>
            <Input value={form.wine_name} onChange={(e) => setForm({ ...form, wine_name: e.target.value })}
              placeholder="Es. Cabernet Riserva 2024" data-testid="wine-name" />
          </div>
          <div>
            <Label>Tipologia vino (macrogruppo)</Label>
            <Select value={form.finished_group_id} onValueChange={(v) => setForm({ ...form, finished_group_id: v })}>
              <SelectTrigger data-testid="wine-group"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
              <SelectContent>
                {finGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          <div>
            <Label>Capacità bottiglia</Label>
            <Select value={String(form.bottle_capacity_l)} onValueChange={(v) => setForm({ ...form, bottle_capacity_l: v })}>
              <SelectTrigger data-testid="bottle-capacity"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CAPACITIES.map((c) => <SelectItem key={c} value={String(c)}>{c.toFixed(2)} L</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* FILTRAZIONE */}
      <SectionCard title="Filtrazione">
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Tangenziale</Label>
          <SiNo name="tang" value={fd.filtrazione_tangenziale} onChange={sf("filtrazione_tangenziale")} />
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-start gap-3">
          <Label className="pt-1">Microporica <span className="text-[10px] text-stone-500">(scelta multipla)</span></Label>
          <div className="flex items-center gap-6 flex-wrap">
            {MICRO_OPTIONS.map((o) => {
              const checked = (fd.filtrazione_microporica || []).includes(o.v);
              return (
                <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const cur = fd.filtrazione_microporica || [];
                      const next = v ? [...cur, o.v] : cur.filter((x) => x !== o.v);
                      sf("filtrazione_microporica")(next);
                    }}
                    data-testid={`micro-${o.v}`}
                  />
                  {o.l}
                </label>
              );
            })}
          </div>
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Dosatore coadiuvante (post filtrazione)</Label>
          <div className="flex items-center gap-6 flex-wrap">
            <SiNo name="dosatore" value={fd.dosatore_coadiuvante} onChange={sf("dosatore_coadiuvante")} />
            <div className="flex items-center gap-2">
              <Label className="text-sm text-stone-600">Dosaggio</Label>
              <Input className="w-40" value={fd.dosaggio} onChange={(e) => sf("dosaggio")(e.target.value)} placeholder="es. 20 g/hl" />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* BOTTIGLIA — 5 righe con spunta + magazzino/manuale + fornita da */}
      <SectionCard title="Bottiglia e chiusure">
        <div className="grid grid-cols-[20px_140px_1fr_1fr_120px] gap-3 text-[11px] uppercase tracking-widest text-stone-500 pb-1 border-b border-stone-200">
          <div></div><div>Componente</div><div>Articolo</div><div>Fornita da</div><div></div>
        </div>
        <ComponentRow label="Bottiglia" cmp={fd.bottiglia} onChange={setCmp("bottiglia")}
          options={optBottles.length ? optBottles : optAll} autoFillSupplier={supplierIsBarbon} />
        <ComponentRow label="Chiusura" cmp={fd.chiusura} onChange={setCmp("chiusura")}
          options={optTappi.length ? optTappi : optAll} autoFillSupplier={supplierIsBarbon} />
        <ComponentRow label="Gabbietta" cmp={fd.gabbietta} onChange={setCmp("gabbietta")}
          options={optGabbietta} autoFillSupplier={supplierIsBarbon} />
        <ComponentRow label="Capsula" cmp={fd.capsula} onChange={setCmp("capsula")}
          options={optCaps.length ? optCaps : optAll} autoFillSupplier={supplierIsBarbon} />
      </SectionCard>

      {/* ETICHETTATURA — spunta + magazzino/manuale + fornita da + quantità (auto bottle_count) */}
      <SectionCard title="Etichettatura">
        <div className="grid grid-cols-[20px_140px_1fr_1fr_120px] gap-3 text-[11px] uppercase tracking-widest text-stone-500 pb-1 border-b border-stone-200">
          <div></div><div>Componente</div><div>Articolo</div><div>Fornita da</div><div>Quantità</div>
        </div>
        <div className="text-[11px] text-stone-500 -mb-2">Quantità suggerita automatica: <b>{bottleQty}</b> (= Tot bottiglie). Modificabile.</div>
        <ComponentRow label="Fronte" cmp={fd.etichetta_fronte} onChange={setCmp("etichetta_fronte")}
          options={optLabels.length ? optLabels : optAll} autoFillSupplier={supplierIsBarbon}
          showQty autoQty={bottleQty} />
        <ComponentRow label="Retro" cmp={fd.etichetta_retro} onChange={setCmp("etichetta_retro")}
          options={optLabels.length ? optLabels : optAll} autoFillSupplier={supplierIsBarbon}
          showQty autoQty={bottleQty} />
        <ComponentRow label="Fascetta" cmp={fd.fascetta} onChange={setCmp("fascetta")}
          options={optLabels.length ? optLabels : optAll} autoFillSupplier={supplierIsBarbon}
          showQty autoQty={bottleQty} />
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3 pt-3 border-t border-stone-100">
          <Label>Centratura ottica</Label>
          <SiNo name="centratura" value={fd.centratura_ottica} onChange={sf("centratura_ottica")} />
        </div>
      </SectionCard>

      {/* CONFEZIONAMENTO */}
      <SectionCard title="Confezionamento">
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Cartone — formato da</Label>
          <div className="flex items-center gap-6 flex-wrap">
            <RadioGroup className="flex items-center gap-5" value={String(form.carton_size)} onValueChange={(v) => setForm({ ...form, carton_size: v })}>
              {CARTON_SIZES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <RadioGroupItem value={String(c)} /> {c}BT
                </label>
              ))}
            </RadioGroup>
            <div className="text-sm text-stone-500">Suggerimento: <b>{suggestedCartons}</b> cartoni</div>
          </div>
        </div>
        <div className="grid grid-cols-[20px_140px_1fr_1fr_120px] gap-3 text-[11px] uppercase tracking-widest text-stone-500 pb-1 border-b border-stone-200 pt-2">
          <div></div><div>Componente</div><div>Articolo</div><div>Fornita da</div><div>Quantità</div>
        </div>
        <ComponentRow label="Cartone" cmp={fd.cartone} onChange={setCmp("cartone")}
          options={optCartons.length ? optCartons : optAll} autoFillSupplier={supplierIsBarbon}
          showQty autoQty={suggestedCartons} />
        <ComponentRow label="Alveare/divisorio" cmp={fd.alveare} onChange={setCmp("alveare")}
          options={optAlveare} autoFillSupplier={supplierIsBarbon}
          showQty autoQty={suggestedCartons} />
        <ComponentRow label="Etichetta su cartone" cmp={fd.etichetta_cartone} onChange={setCmp("etichetta_cartone")}
          options={[]} manualOnly autoFillSupplier={supplierIsBarbon}
          showQty autoQty={suggestedCartons} />
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3 pt-3 border-t border-stone-100">
          <Label>Nastratrice</Label>
          <SiNo name="nastratrice" value={fd.nastratrice} onChange={sf("nastratrice")} />
        </div>
      </SectionCard>

      {/* PALETTE */}
      <SectionCard title="Palette">
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Palette</Label>
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
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Tipologia</Label>
          <RadioGroup className="flex items-center gap-5 flex-wrap" value={fd.palette_tipo} onValueChange={sf("palette_tipo")}>
            {[["epal_80x120","Epal 80x120"],["pallet_80x120","Pallet 80x120"],["pallet_100x120","Pallet 100x120"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <RadioGroupItem value={v} /> {l}
              </label>
            ))}
          </RadioGroup>
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-start gap-3">
          <Label className="pt-2">Totali</Label>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div><Label className="text-[11px] text-stone-500">tot pallet</Label>
              <Input type="number" value={fd.palette_tot} onChange={(e) => sf("palette_tot")(e.target.value)} /></div>
            <div><Label className="text-[11px] text-stone-500">sc/pallet</Label>
              <Input type="number" value={fd.palette_sc_per} onChange={(e) => sf("palette_sc_per")(e.target.value)} /></div>
          </div>
        </div>
      </SectionCard>

      {/* CESTONI */}
      <SectionCard title="Cestoni">
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Cestoni</Label>
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
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Tipologia</Label>
          <RadioGroup className="flex items-center gap-5 flex-wrap" value={fd.cestone_tipo} onValueChange={sf("cestone_tipo")}>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value="cestone_epal" /> Cestone + Epal 80x120</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value="cestone_normale" /> Cestone normale</label>
          </RadioGroup>
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Piani</Label>
          <RadioGroup className="flex items-center gap-5" value={String(fd.cestone_piani || "")} onValueChange={(v) => sf("cestone_piani")(Number(v))}>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value="2" /> 2 piani</label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer"><RadioGroupItem value="3" /> 3 piani</label>
          </RadioGroup>
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-start gap-3">
          <Label className="pt-2">Totali</Label>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div><Label className="text-[11px] text-stone-500">tot cestoni</Label>
              <Input type="number" value={fd.cestone_tot} onChange={(e) => sf("cestone_tot")(e.target.value)} /></div>
            <div><Label className="text-[11px] text-stone-500">bt/cestone</Label>
              <Input type="number" value={fd.cestone_bt_per} onChange={(e) => sf("cestone_bt_per")(e.target.value)} /></div>
          </div>
        </div>
        <div className="grid md:grid-cols-[180px_1fr] items-center gap-3">
          <Label>Falde pvc</Label>
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
        </div>
      </SectionCard>

      <SectionCard title="Note">
        <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Osservazioni di produzione…" />
      </SectionCard>

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
