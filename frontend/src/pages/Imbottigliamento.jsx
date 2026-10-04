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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Info, Download, Plus, Pencil } from "lucide-react";

const CAPACITIES = [0.20, 0.35, 0.50, 0.75, 1.50, 3.00];
const CARTON_SIZES = [6, 12, 24];

export default function Imbottigliamento() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const [rawGroups, setRawGroups] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [finGroups, setFinGroups] = useState([]);
  const [finItems, setFinItems] = useState([]);
  const [editMeta, setEditMeta] = useState(null); // { operator_name, created_at }

  const [form, setForm] = useState({
    supplier: "tenuta_barbon",
    client_name: "",
    wine_name: "",
    finished_item_id: "__new__",
    new_lot_name: "",
    finished_group_id: "",
    bottle_count: 1200,
    bottle_capacity_l: 0.75,
    carton_size: 12,
    carton_count: 100,
    notes: "",
  });
  const [materials, setMaterials] = useState({}); // raw_item_id -> quantity

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
          setEditMeta({ operator_name: rec.operator_name, created_at: rec.created_at, edited_by: rec.edited_by, edited_at: rec.edited_at });
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
        }
      } catch (e) { toast.error(formatApiError(e)); }
    })();
    // eslint-disable-next-line
  }, [editId]);

  // Automatic HL calc
  const hl = useMemo(() => (Number(form.bottle_count) * Number(form.bottle_capacity_l)) / 100, [form.bottle_count, form.bottle_capacity_l]);
  // Suggested carton count
  const suggestedCartons = useMemo(() => Math.ceil(Number(form.bottle_count) / Number(form.carton_size || 1)), [form.bottle_count, form.carton_size]);
  // Keep carton_count in sync when user hasn't manually edited... Simpler: auto-set on change of count/size
  useEffect(() => { setForm((f) => ({ ...f, carton_count: Math.ceil(f.bottle_count / (f.carton_size || 1)) })); // eslint-disable-next-line
  }, [form.bottle_count, form.carton_size]);

  const setMat = (id, q) => setMaterials((m) => ({ ...m, [id]: q }));

  // Suggested materials: bottles / capsule / etichette / tappi = bottle_count ; cartoni = suggestedCartons
  const suggestedFor = (item) => {
    const g = rawGroups.find((g) => g.id === item.group_id);
    const name = g?.name || "";
    if (name === "Cartoni") {
      // suggest only matching carton size
      if (!item.name.includes(String(form.carton_size))) return 0;
      return suggestedCartons;
    }
    if (name === "Bottiglie vuote") {
      // suggest only bottles matching capacity (textual match on L in name)
      const capStr = form.bottle_capacity_l.toString().replace(".", ",");
      if (!item.name.includes(capStr)) return 0;
      return Number(form.bottle_count);
    }
    // Capsule, Etichette, Tappi → suggest bottle_count on all matching items (user picks)
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

      // Download PDF
      try {
        const resp = await api.get(`/bottling/${recordId}/pdf`, { responseType: "blob" });
        const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url; a.download = `imbottigliamento_${recordId}.pdf`;
        a.click(); URL.revokeObjectURL(url);
      } catch (_e) { /* ignore */ }

      if (isEdit) {
        navigate("/cronologia");
      } else {
        setMaterials({});
        setForm((f) => ({ ...f, wine_name: "", new_lot_name: "", bottle_count: 1200, notes: "" }));
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // Group raw items by group for display
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
    <div className="space-y-6" data-testid="bottling-root">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Produzione</div>
        <h1 className="font-serif-display text-4xl text-stone-900 flex items-center gap-3">
          {isEdit && <Pencil className="w-7 h-7 text-amber-600" />}
          {isEdit ? "Modifica imbottigliamento" : "Modulo imbottigliamento"}
        </h1>
        <p className="text-stone-500 mt-2">
          {isEdit
            ? "Correggi i dati del lotto. Al salvataggio il magazzino verrà prima ripristinato e poi aggiornato con i nuovi valori."
            : "Compila i dati del lotto. Ettolitri e cartoni sono calcolati automaticamente."}
        </p>
        {isEdit && editMeta && (
          <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-4 py-2 text-sm inline-flex items-center gap-2">
            <Info className="w-4 h-4" />
            Modifica di un modulo registrato da <b>{editMeta.operator_name}</b> il {new Date(editMeta.created_at).toLocaleString("it-IT")}
            {editMeta.edited_at && <span>· già modificato il {new Date(editMeta.edited_at).toLocaleString("it-IT")} da {editMeta.edited_by}</span>}
          </div>
        )}
      </div>

      {/* Supplier */}
      <Card className="card-elevated">
        <CardContent className="p-6 space-y-4">
          <div>
            <Label className="text-sm font-semibold text-stone-800">Chi ha fornito il materiale?</Label>
            <RadioGroup
              className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2"
              value={form.supplier}
              onValueChange={(v) => setForm({ ...form, supplier: v })}
            >
              <label className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer ${form.supplier === "tenuta_barbon" ? "border-[#6B1D2F] bg-[#6B1D2F]/5" : "border-stone-200"}`}>
                <RadioGroupItem value="tenuta_barbon" data-testid="supplier-barbon" />
                <div>
                  <div className="font-medium">Tenuta Barbon</div>
                  <div className="text-xs text-stone-500">Le quantità saranno sottratte dal magazzino.</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer ${form.supplier === "cliente" ? "border-sky-500 bg-sky-50" : "border-stone-200"}`}>
                <RadioGroupItem value="cliente" data-testid="supplier-cliente" />
                <div>
                  <div className="font-medium">Cliente / Conto terzi</div>
                  <div className="text-xs text-stone-500">Nessuna detrazione dal magazzino Tenuta Barbon.</div>
                </div>
              </label>
            </RadioGroup>
            {form.supplier === "cliente" && (
              <div className="mt-3">
                <Label>Nome cliente</Label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} data-testid="client-name-input" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Prodotto finito destinazione */}
      <Card className="card-elevated">
        <CardContent className="p-6 space-y-4">
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
            {form.finished_item_id === "__new__" && (
              <>
                <div>
                  <Label>Nome nuovo lotto</Label>
                  <Input value={form.new_lot_name} onChange={(e) => setForm({ ...form, new_lot_name: e.target.value })} data-testid="new-lot-name" placeholder="Es. Chardonnay 2025 — Lotto G" />
                </div>
                <div>
                  <Label>Tipologia (macrogruppo)</Label>
                  <Select value={form.finished_group_id} onValueChange={(v) => setForm({ ...form, finished_group_id: v })}>
                    <SelectTrigger data-testid="new-lot-group"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                    <SelectContent>
                      {finGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottles + Carton calc */}
      <Card className="card-elevated">
        <CardContent className="p-6 space-y-5">
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label>Numero bottiglie</Label>
              <Input type="number" min="0" value={form.bottle_count} onChange={(e) => setForm({ ...form, bottle_count: e.target.value })} data-testid="bottle-count" />
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
            <div>
              <Label>Formato cartone</Label>
              <Select value={String(form.carton_size)} onValueChange={(v) => setForm({ ...form, carton_size: v })}>
                <SelectTrigger data-testid="carton-size"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARTON_SIZES.map((c) => <SelectItem key={c} value={String(c)}>{c} bott./cartone</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cartoni (modificabile)</Label>
              <Input type="number" min="0" value={form.carton_count} onChange={(e) => setForm({ ...form, carton_count: e.target.value })} data-testid="carton-count" />
              <div className="text-xs text-stone-500 mt-1">Suggerimento: {suggestedCartons}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="bg-[#6B1D2F]/5 border border-[#6B1D2F]/20 rounded-md px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-stone-500">Ettolitri</div>
              <div className="font-mono-num text-2xl text-[#6B1D2F] font-bold" data-testid="hl-value">{hl.toFixed(2)} HL</div>
              <div className="text-[10px] text-stone-500 mt-1">({form.bottle_count} × {form.bottle_capacity_l} L) / 100</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-amber-700">Cartoni suggeriti</div>
              <div className="font-mono-num text-2xl text-amber-800 font-bold">{suggestedCartons}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials */}
      <Card className="card-elevated">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-serif-display text-xl">Materiale utilizzato</div>
              <div className="text-xs text-stone-500">Le quantità sono suggerimenti modificabili.</div>
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
                                type="number" min="0"
                                value={used}
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
        <CardContent className="p-6 space-y-4">
          <div><Label>Note</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Note di produzione…" />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-stone-500">Al salvataggio verrà generato automaticamente il PDF riepilogativo.</div>
            <Button className="btn-wine h-11 px-6" onClick={submit} data-testid="bottling-submit-button">
              <FileText className="w-4 h-4 mr-2" /> {isEdit ? "Salva modifiche" : "Salva imbottigliamento"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
