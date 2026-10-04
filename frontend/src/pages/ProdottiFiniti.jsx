import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Trash2, ArrowLeft, Pencil, Wine } from "lucide-react";
import { toast } from "sonner";

const CAPACITIES = [0.20, 0.35, 0.50, 0.75, 1.50, 3.00];

export default function ProdottiFiniti() {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });

  const [itemDlg, setItemDlg] = useState({ open: false, edit: null });
  const [itemForm, setItemForm] = useState({ name: "", quantity: 0, min_threshold: 0, bottle_capacity_l: 0.75, notes: "", barcode: "" });

  const [adjustDlg, setAdjustDlg] = useState({ open: false, item: null, delta: 0, reason: "" });

  const loadGroups = async () => {
    try { const { data } = await api.get("/groups", { params: { kind: "finished" } }); setGroups(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const loadItems = async (gid) => {
    try { const { data } = await api.get("/finished-items", { params: { group_id: gid } }); setItems(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { if (selected) loadItems(selected.id); }, [selected]);

  const createGroup = async () => {
    if (!newGroup.name.trim()) return;
    try {
      await api.post("/groups", { ...newGroup, kind: "finished" });
      toast.success("Macrogruppo creato");
      setNewGroupOpen(false); setNewGroup({ name: "", description: "" });
      loadGroups();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openCreateItem = () => {
    setItemForm({ name: "", quantity: 0, min_threshold: 0, bottle_capacity_l: 0.75, notes: "", barcode: "" });
    setItemDlg({ open: true, edit: null });
  };
  const openEditItem = (it) => {
    setItemForm({ name: it.name, quantity: it.quantity, min_threshold: it.min_threshold, bottle_capacity_l: it.bottle_capacity_l || 0.75, notes: it.notes || "", barcode: it.barcode || "" });
    setItemDlg({ open: true, edit: it });
  };
  const saveItem = async () => {
    try {
      const payload = { ...itemForm, group_id: selected.id, unit: "bott.", quantity: Number(itemForm.quantity), min_threshold: Number(itemForm.min_threshold), bottle_capacity_l: Number(itemForm.bottle_capacity_l) };
      if (itemDlg.edit) await api.put(`/finished-items/${itemDlg.edit.id}`, payload);
      else await api.post("/finished-items", payload);
      toast.success("Lotto salvato");
      setItemDlg({ open: false, edit: null });
      loadItems(selected.id);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const deleteItem = async (it) => {
    if (!window.confirm(`Eliminare "${it.name}"?`)) return;
    try { await api.delete(`/finished-items/${it.id}`); toast.success("Eliminato"); loadItems(selected.id); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const saveAdjust = async () => {
    try {
      await api.post(`/finished-items/${adjustDlg.item.id}/adjust`, {
        quantity_delta: Number(adjustDlg.delta), reason: adjustDlg.reason || "Rettifica manuale",
      });
      toast.success("Scorta aggiornata");
      setAdjustDlg({ open: false, item: null, delta: 0, reason: "" });
      loadItems(selected.id);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!selected) {
    return (
      <div className="space-y-6" data-testid="finiti-root">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Magazzino</div>
            <h1 className="font-serif-display text-4xl text-stone-900">Prodotti finiti</h1>
            <p className="text-stone-500 mt-2">Scegli una tipologia di vino per vedere i lotti.</p>
          </div>
          <Button onClick={() => setNewGroupOpen(true)} className="btn-wine" data-testid="new-fin-group-btn">
            <Plus className="w-4 h-4 mr-2" /> Nuovo macrogruppo
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Card key={g.id} className="card-elevated group relative hover:shadow-md transition-shadow" data-testid={`fin-group-${g.name}`}>
              <button
                type="button"
                className="absolute top-3 right-3 w-8 h-8 rounded-md border border-stone-200 bg-white/80 hover:bg-red-50 hover:border-red-300 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const items = await api.get("/finished-items", { params: { group_id: g.id } });
                    const cnt = items.data.length;
                    const msg = cnt > 0
                      ? `Il macrogruppo "${g.name}" contiene ${cnt} lotti. Eliminare TUTTO (gruppo + lotti)?`
                      : `Eliminare il macrogruppo "${g.name}"?`;
                    if (!window.confirm(msg)) return;
                    await api.delete(`/groups/${g.id}`, { params: { cascade: cnt > 0 } });
                    toast.success("Macrogruppo eliminato");
                    loadGroups();
                  } catch (err) { toast.error(formatApiError(err)); }
                }}
                data-testid={`del-fin-group-${g.name}`}
                title="Elimina macrogruppo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="cursor-pointer" onClick={() => setSelected(g)}>
                <CardContent className="p-5">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center mb-3" style={{ background: "#B4530914", color: "#B45309" }}>
                    <Wine className="w-5 h-5" />
                  </div>
                  <div className="font-serif-display text-xl text-stone-900">{g.name}</div>
                  <div className="text-xs text-stone-500 mt-1">{g.description || "—"}</div>
                </CardContent>
              </div>
            </Card>
          ))}
          {groups.length === 0 && <div className="text-stone-500 col-span-full">Nessun macrogruppo.</div>}
        </div>

        <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
          <DialogContent data-testid="new-fin-group-dialog">
            <DialogHeader><DialogTitle className="font-serif-display text-2xl">Nuova tipologia</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label>
                <Input value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} data-testid="new-fin-group-name" />
              </div>
              <div><Label>Descrizione</Label>
                <Input value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewGroupOpen(false)}>Annulla</Button>
              <Button className="btn-wine" onClick={createGroup} data-testid="new-fin-group-save">Crea</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="finiti-group-view">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Macrogruppi
          </Button>
          <h1 className="font-serif-display text-4xl text-stone-900 mt-1">{selected.name}</h1>
          <p className="text-stone-500">{selected.description}</p>
        </div>
        <Button onClick={openCreateItem} className="btn-wine" data-testid="new-fin-item-btn">
          <Plus className="w-4 h-4 mr-2" /> Nuovo lotto
        </Button>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lotto / Partita</TableHead>
                <TableHead className="text-right">Capacità</TableHead>
                <TableHead className="text-right">Bottiglie</TableHead>
                <TableHead className="text-right">HL totali</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const low = it.min_threshold > 0 && it.quantity <= it.min_threshold;
                const hl = ((it.quantity || 0) * (it.bottle_capacity_l || 0)) / 100;
                return (
                  <TableRow key={it.id} data-testid={`fin-row-${it.name}`}>
                    <TableCell><div className="font-medium">{it.name}</div></TableCell>
                    <TableCell className="text-right font-mono-num">{it.bottle_capacity_l} L</TableCell>
                    <TableCell className="text-right font-mono-num">{it.quantity}</TableCell>
                    <TableCell className="text-right font-mono-num text-stone-500">{hl.toFixed(2)}</TableCell>
                    <TableCell>
                      {low ? <Badge className="bg-amber-100 text-amber-800 border border-amber-300">In esaurimento</Badge>
                        : <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setAdjustDlg({ open: true, item: it, delta: 0, reason: "" })}>
                        <Plus className="w-3 h-3" /><Minus className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditItem(it)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => deleteItem(it)}><Trash2 className="w-3 h-3" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-stone-500 py-8">Nessun lotto.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={itemDlg.open} onOpenChange={(o) => setItemDlg({ ...itemDlg, open: o })}>
        <DialogContent data-testid="fin-item-dialog">
          <DialogHeader><DialogTitle className="font-serif-display text-2xl">{itemDlg.edit ? "Modifica lotto" : "Nuovo lotto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome lotto/partita</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} data-testid="fin-item-name" placeholder="Es. Cabernet 2024 — Lotto A" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Bottiglie</Label>
                <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
              </div>
              <div><Label>Capacità (L)</Label>
                <Select value={String(itemForm.bottle_capacity_l)} onValueChange={(v) => setItemForm({ ...itemForm, bottle_capacity_l: v })}>
                  <SelectTrigger data-testid="fin-item-capacity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAPACITIES.map((c) => <SelectItem key={c} value={String(c)}>{c.toFixed(2)} L</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Soglia min.</Label>
                <Input type="number" value={itemForm.min_threshold} onChange={(e) => setItemForm({ ...itemForm, min_threshold: e.target.value })} />
              </div>
            </div>
            <div><Label>Codice (barcode/QR)</Label>
              <Input
                value={itemForm.barcode}
                onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                onPaste={(e) => {
                  const txt = (e.clipboardData.getData("text") || "").replace(/[\r\n]+/g, "").trim();
                  e.preventDefault();
                  setItemForm({ ...itemForm, barcode: txt });
                }}
                data-testid="fin-item-barcode"
                placeholder="Scansiona o inserisci (es. 8001234567890)"
                autoComplete="off"
              />
              <div className="text-[11px] text-stone-500 mt-1">
                Clicca nel campo e scansiona col lettore. Il codice deve essere univoco.
              </div>
            </div>
            <div><Label>Note</Label>
              <Textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDlg({ open: false, edit: null })}>Annulla</Button>
            <Button className="btn-wine" onClick={saveItem} data-testid="fin-item-save">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustDlg.open} onOpenChange={(o) => setAdjustDlg({ ...adjustDlg, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif-display text-2xl">Rettifica lotto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-stone-600">Lotto: <b>{adjustDlg.item?.name}</b> ({adjustDlg.item?.quantity} bott.)</div>
            <div><Label>Variazione (+/-)</Label>
              <Input type="number" value={adjustDlg.delta} onChange={(e) => setAdjustDlg({ ...adjustDlg, delta: e.target.value })} />
            </div>
            <div><Label>Motivo</Label>
              <Input value={adjustDlg.reason} onChange={(e) => setAdjustDlg({ ...adjustDlg, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDlg({ open: false, item: null })}>Annulla</Button>
            <Button className="btn-wine" onClick={saveAdjust}>Applica</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
