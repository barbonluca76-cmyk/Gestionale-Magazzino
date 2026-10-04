import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Trash2, ArrowLeft, Pencil, Package2 } from "lucide-react";
import { toast } from "sonner";

export default function MateriePrime() {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null); // group
  const [items, setItems] = useState([]);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });

  const [itemDlg, setItemDlg] = useState({ open: false, edit: null });
  const [itemForm, setItemForm] = useState({ name: "", quantity: 0, unit: "pz", min_threshold: 0, notes: "", barcode: "" });

  const [adjustDlg, setAdjustDlg] = useState({ open: false, item: null, delta: 0, reason: "" });

  const loadGroups = async () => {
    try { const { data } = await api.get("/groups", { params: { kind: "raw" } }); setGroups(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const loadItems = async (gid) => {
    try { const { data } = await api.get("/raw-items", { params: { group_id: gid } }); setItems(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { if (selected) loadItems(selected.id); }, [selected]);

  const totalByGroup = useMemo(() => {
    const map = {};
    return map;
  }, [groups]);

  const createGroup = async () => {
    if (!newGroup.name.trim()) return;
    try {
      await api.post("/groups", { ...newGroup, kind: "raw" });
      toast.success("Macrogruppo creato");
      setNewGroupOpen(false); setNewGroup({ name: "", description: "" });
      loadGroups();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openCreateItem = () => {
    setItemForm({ name: "", quantity: 0, unit: "pz", min_threshold: 0, notes: "", barcode: "" });
    setItemDlg({ open: true, edit: null });
  };
  const openEditItem = (it) => {
    setItemForm({ name: it.name, quantity: it.quantity, unit: it.unit, min_threshold: it.min_threshold, notes: it.notes || "", barcode: it.barcode || "" });
    setItemDlg({ open: true, edit: it });
  };
  const saveItem = async () => {
    try {
      const payload = { ...itemForm, group_id: selected.id, quantity: Number(itemForm.quantity), min_threshold: Number(itemForm.min_threshold) };
      if (itemDlg.edit) await api.put(`/raw-items/${itemDlg.edit.id}`, payload);
      else await api.post("/raw-items", payload);
      toast.success("Articolo salvato");
      setItemDlg({ open: false, edit: null });
      loadItems(selected.id);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const deleteItem = async (it) => {
    if (!window.confirm(`Eliminare "${it.name}"?`)) return;
    try { await api.delete(`/raw-items/${it.id}`); toast.success("Eliminato"); loadItems(selected.id); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const saveAdjust = async () => {
    try {
      await api.post(`/raw-items/${adjustDlg.item.id}/adjust`, {
        quantity_delta: Number(adjustDlg.delta), reason: adjustDlg.reason || "Rettifica manuale",
      });
      toast.success("Scorta aggiornata");
      setAdjustDlg({ open: false, item: null, delta: 0, reason: "" });
      loadItems(selected.id);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!selected) {
    return (
      <div className="space-y-6" data-testid="materie-root">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Magazzino</div>
            <h1 className="font-serif-display text-4xl text-stone-900">Materie prime</h1>
            <p className="text-stone-500 mt-2">Scegli un macrogruppo per vedere articoli e quantità.</p>
          </div>
          <Button onClick={() => setNewGroupOpen(true)} className="btn-wine" data-testid="new-raw-group-btn">
            <Plus className="w-4 h-4 mr-2" /> Nuovo macrogruppo
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Card
              key={g.id}
              className="card-elevated group relative hover:shadow-md transition-shadow"
              data-testid={`raw-group-${g.name}`}
            >
              <button
                type="button"
                className="absolute top-3 right-3 w-8 h-8 rounded-md border border-stone-200 bg-white/80 hover:bg-red-50 hover:border-red-300 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const items = await api.get("/raw-items", { params: { group_id: g.id } });
                    const cnt = items.data.length;
                    const msg = cnt > 0
                      ? `Il macrogruppo "${g.name}" contiene ${cnt} articoli. Eliminare TUTTO (gruppo + articoli)?`
                      : `Eliminare il macrogruppo "${g.name}"?`;
                    if (!window.confirm(msg)) return;
                    await api.delete(`/groups/${g.id}`, { params: { cascade: cnt > 0 } });
                    toast.success("Macrogruppo eliminato");
                    loadGroups();
                  } catch (err) { toast.error(formatApiError(err)); }
                }}
                data-testid={`del-raw-group-${g.name}`}
                title="Elimina macrogruppo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="cursor-pointer" onClick={() => setSelected(g)}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: "#6B1D2F14", color: "#6B1D2F" }}>
                      <Package2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="font-serif-display text-xl text-stone-900">{g.name}</div>
                  <div className="text-xs text-stone-500 mt-1">{g.description || "—"}</div>
                </CardContent>
              </div>
            </Card>
          ))}
          {groups.length === 0 && <div className="text-stone-500 col-span-full">Nessun macrogruppo. Creane uno per iniziare.</div>}
        </div>

        <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
          <DialogContent data-testid="new-raw-group-dialog">
            <DialogHeader><DialogTitle className="font-serif-display text-2xl">Nuovo macrogruppo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} data-testid="new-raw-group-name" />
              </div>
              <div>
                <Label>Descrizione</Label>
                <Input value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewGroupOpen(false)}>Annulla</Button>
              <Button className="btn-wine" onClick={createGroup} data-testid="new-raw-group-save">Crea</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="materie-group-view">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="back-to-groups-btn">
            <ArrowLeft className="w-4 h-4 mr-1" /> Macrogruppi
          </Button>
          <h1 className="font-serif-display text-4xl text-stone-900 mt-1">{selected.name}</h1>
          <p className="text-stone-500">{selected.description}</p>
        </div>
        <Button onClick={openCreateItem} className="btn-wine" data-testid="new-raw-item-btn">
          <Plus className="w-4 h-4 mr-2" /> Nuovo articolo
        </Button>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Articolo</TableHead>
                <TableHead className="text-right">Quantità</TableHead>
                <TableHead className="text-right">Soglia min.</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const low = it.min_threshold > 0 && it.quantity <= it.min_threshold;
                return (
                  <TableRow key={it.id} data-testid={`raw-row-${it.name}`}>
                    <TableCell>
                      <div className="font-medium text-stone-800">{it.name}</div>
                      {it.notes && <div className="text-xs text-stone-500">{it.notes}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono-num">{it.quantity} {it.unit}</TableCell>
                    <TableCell className="text-right font-mono-num text-stone-500">{it.min_threshold}</TableCell>
                    <TableCell>
                      {low ? <Badge className="bg-amber-100 text-amber-800 border border-amber-300">In esaurimento</Badge>
                        : <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setAdjustDlg({ open: true, item: it, delta: 0, reason: "" })} data-testid={`adjust-raw-${it.name}`}>
                        <Plus className="w-3 h-3" /><Minus className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditItem(it)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteItem(it)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-stone-500 py-8">Nessun articolo in questo macrogruppo.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={itemDlg.open} onOpenChange={(o) => setItemDlg({ ...itemDlg, open: o })}>
        <DialogContent data-testid="raw-item-dialog">
          <DialogHeader><DialogTitle className="font-serif-display text-2xl">
            {itemDlg.edit ? "Modifica articolo" : "Nuovo articolo"}
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} data-testid="raw-item-name" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Quantità</Label>
                <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} data-testid="raw-item-quantity" />
              </div>
              <div><Label>Unità</Label>
                <Input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
              </div>
              <div><Label>Soglia min.</Label>
                <Input type="number" value={itemForm.min_threshold} onChange={(e) => setItemForm({ ...itemForm, min_threshold: e.target.value })} data-testid="raw-item-threshold" />
              </div>
            </div>
            <div><Label>Codice (barcode/QR)</Label>
              <Input value={itemForm.barcode} onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })} data-testid="raw-item-barcode" placeholder="Es. BOT-075-VERDE" />
            </div>
            <div><Label>Note</Label>
              <Textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDlg({ open: false, edit: null })}>Annulla</Button>
            <Button className="btn-wine" onClick={saveItem} data-testid="raw-item-save">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustDlg.open} onOpenChange={(o) => setAdjustDlg({ ...adjustDlg, open: o })}>
        <DialogContent data-testid="adjust-dialog">
          <DialogHeader><DialogTitle className="font-serif-display text-2xl">Rettifica scorta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-stone-600">Articolo: <b>{adjustDlg.item?.name}</b> ({adjustDlg.item?.quantity} {adjustDlg.item?.unit})</div>
            <div>
              <Label>Variazione (+/-)</Label>
              <Input type="number" value={adjustDlg.delta} onChange={(e) => setAdjustDlg({ ...adjustDlg, delta: e.target.value })} data-testid="adjust-delta" />
              <div className="text-xs text-stone-500 mt-1">Usa un numero negativo per sottrarre.</div>
            </div>
            <div>
              <Label>Motivo</Label>
              <Input value={adjustDlg.reason} onChange={(e) => setAdjustDlg({ ...adjustDlg, reason: e.target.value })} placeholder="Es. ricevuta fornitore, rottura, inventario…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDlg({ open: false, item: null })}>Annulla</Button>
            <Button className="btn-wine" onClick={saveAdjust} data-testid="adjust-save">Applica</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
