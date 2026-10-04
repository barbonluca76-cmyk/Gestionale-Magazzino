import { useEffect, useState, useMemo } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, History, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const KIND_LABELS = {
  stock_adjust: "Rettifica",
  bottling: "Imbottigliamento",
  bottling_reversal: "Annullamento",
  item_create: "Creazione",
  item_delete: "Eliminazione",
};

export default function Cronologia() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [movs, setMovs] = useState([]);
  const [operators, setOperators] = useState([]);
  const [filters, setFilters] = useState({ operator_id: "all", kind: "all", search: "" });

  const load = async () => {
    try {
      const params = {};
      if (filters.operator_id !== "all") params.operator_id = filters.operator_id;
      if (filters.kind !== "all") params.kind = filters.kind;
      const [m, o] = await Promise.all([
        api.get("/movements", { params }),
        api.get("/auth/operators"),
      ]);
      setMovs(m.data); setOperators(o.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [filters.operator_id, filters.kind]);

  const filtered = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    if (!s) return movs;
    return movs.filter((m) =>
      (m.item_name || "").toLowerCase().includes(s) ||
      (m.reason || "").toLowerCase().includes(s) ||
      (m.operator_name || "").toLowerCase().includes(s)
    );
  }, [movs, filters.search]);

  const downloadPdf = async (bid) => {
    try {
      const resp = await api.get(`/bottling/${bid}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `imbottigliamento_${bid}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const cancelBottling = async (bid) => {
    if (!window.confirm("Annullare questo imbottigliamento? Il magazzino verrà ripristinato (bottiglie sottratte, materiali riaggiunti).")) return;
    try {
      await api.delete(`/bottling/${bid}`);
      toast.success("Imbottigliamento annullato — magazzino ripristinato");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="cronologia-root">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Audit</div>
        <h1 className="font-serif-display text-4xl text-stone-900 flex items-center gap-3">
          <History className="w-7 h-7 text-stone-500" /> Cronologia movimenti
        </h1>
        <p className="text-stone-500 mt-2">Ogni operazione sul magazzino viene registrata con operatore e motivazione.</p>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-4 grid md:grid-cols-3 gap-3">
          <div>
            <Select value={filters.operator_id} onValueChange={(v) => setFilters({ ...filters, operator_id: v })}>
              <SelectTrigger data-testid="filter-operator"><SelectValue placeholder="Tutti gli operatori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli operatori</SelectItem>
                {operators.map((o) => <SelectItem key={o.id} value={o.id}>{o.name || o.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={filters.kind} onValueChange={(v) => setFilters({ ...filters, kind: v })}>
              <SelectTrigger data-testid="filter-kind"><SelectValue placeholder="Tipo movimento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                <SelectItem value="bottling">Imbottigliamento</SelectItem>
                <SelectItem value="bottling_reversal">Annullamento</SelectItem>
                <SelectItem value="stock_adjust">Rettifica</SelectItem>
                <SelectItem value="item_create">Creazione</SelectItem>
                <SelectItem value="item_delete">Eliminazione</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Cerca per articolo / motivo…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} data-testid="filter-search" />
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Operatore</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Articolo / Lotto</TableHead>
                <TableHead className="text-right">Variazione</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id} data-testid={`mov-row-${m.id}`}>
                  <TableCell className="font-mono-num text-xs">{new Date(m.created_at).toLocaleString("it-IT")}</TableCell>
                  <TableCell>{m.operator_name}</TableCell>
                  <TableCell><Badge className={
                    m.kind === "bottling_reversal" ? "bg-red-50 text-red-700 border border-red-200" :
                    m.kind === "bottling" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
                    "bg-stone-100 text-stone-700 border"
                  }>{KIND_LABELS[m.kind] || m.kind}</Badge></TableCell>
                  <TableCell>{m.item_name}</TableCell>
                  <TableCell className={`text-right font-mono-num ${m.quantity_delta < 0 ? "text-red-700" : m.quantity_delta > 0 ? "text-emerald-700" : "text-stone-500"}`}>
                    {m.quantity_delta > 0 ? "+" : ""}{m.quantity_delta}
                  </TableCell>
                  <TableCell className="text-sm text-stone-600">{m.reason}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {m.kind === "bottling" && m.extra?.bottling_id && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => downloadPdf(m.extra.bottling_id)} data-testid={`download-pdf-${m.extra.bottling_id}`} title="Scarica PDF">
                            <Download className="w-3 h-3" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => cancelBottling(m.extra.bottling_id)}
                              data-testid={`cancel-bottling-${m.extra.bottling_id}`}
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              title="Annulla imbottigliamento (solo Ufficio)"
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-stone-500 py-8">Nessun movimento.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
