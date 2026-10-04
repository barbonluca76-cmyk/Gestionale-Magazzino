import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, Briefcase, Hammer } from "lucide-react";
import { toast } from "sonner";

export default function Operatori() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({ name: "", role: "operator" });

  const load = async () => {
    try { const { data } = await api.get("/auth/operators"); setList(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Inserisci un nome"); return; }
    try {
      await api.post("/auth/operators", form);
      toast.success("Operatore creato");
      setDlg(false);
      setForm({ name: "", role: "operator" });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (op) => {
    if (!window.confirm(`Eliminare ${op.name}?`)) return;
    try { await api.delete(`/auth/operators/${op.id}`); toast.success("Eliminato"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6" data-testid="operatori-root">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Team</div>
          <h1 className="font-serif-display text-4xl text-stone-900 flex items-center gap-3">
            <Users className="w-7 h-7 text-stone-500" /> Operatori
          </h1>
          <p className="text-stone-500 mt-2">Gestisci chi può accedere al sistema. Solo l&apos;Ufficio (Admin) può modificare o annullare un imbottigliamento sbagliato.</p>
        </div>
        {isAdmin && (
          <Button className="btn-wine" onClick={() => setDlg(true)} data-testid="new-operator-btn">
            <Plus className="w-4 h-4 mr-2" /> Nuovo operatore
          </Button>
        )}
      </div>

      <Card className="card-elevated">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Creato il</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((o) => (
                <TableRow key={o.id} data-testid={`op-row-${o.name}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${o.role === "admin" ? "bg-[#6B1D2F] text-white" : "bg-stone-800 text-white"}`}>
                        {o.role === "admin" ? <Briefcase className="w-4 h-4" /> : <Hammer className="w-4 h-4" />}
                      </div>
                      <span className="font-medium">{o.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={o.role === "admin" ? "bg-[#6B1D2F] text-white" : "bg-stone-100 text-stone-700 border"}>
                      {o.role === "admin" ? "Ufficio (Admin)" : "Operatore"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-stone-500 font-mono-num">
                    {o.created_at ? new Date(o.created_at).toLocaleDateString("it-IT") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && o.id !== user?.id && (
                      <Button variant="outline" size="sm" onClick={() => del(o)} data-testid={`del-op-${o.name}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent data-testid="new-op-dialog">
          <DialogHeader><DialogTitle className="font-serif-display text-2xl">Nuovo operatore</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="op-name-input" placeholder="Es. Mario Rossi" />
            </div>
            <div>
              <Label>Ruolo</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="op-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operatore (registra operazioni)</SelectItem>
                  <SelectItem value="admin">Ufficio / Admin (può modificare e annullare)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-md p-3">
              Il nome inserito comparirà nella schermata di accesso e verrà registrato in cronologia per ogni operazione svolta.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Annulla</Button>
            <Button className="btn-wine" onClick={save} data-testid="op-save-btn">Crea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
