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
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export default function Operatori() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator" });

  const load = async () => {
    try { const { data } = await api.get("/auth/operators"); setList(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/auth/operators", form);
      toast.success("Operatore creato");
      setDlg(false);
      setForm({ name: "", email: "", password: "", role: "operator" });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (op) => {
    if (!window.confirm(`Eliminare ${op.email}?`)) return;
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
          <p className="text-stone-500 mt-2">Gestisci chi può accedere al sistema.</p>
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
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Creato il</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((o) => (
                <TableRow key={o.id} data-testid={`op-row-${o.email}`}>
                  <TableCell className="font-medium">{o.name || "—"}</TableCell>
                  <TableCell>{o.email}</TableCell>
                  <TableCell>
                    <Badge className={o.role === "admin" ? "bg-[#6B1D2F] text-white" : "bg-stone-100 text-stone-700 border"}>
                      {o.role === "admin" ? "Admin" : "Operatore"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-stone-500 font-mono-num">
                    {o.created_at ? new Date(o.created_at).toLocaleDateString("it-IT") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && o.id !== user?.id && (
                      <Button variant="outline" size="sm" onClick={() => del(o)} data-testid={`del-op-${o.email}`}>
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
            <div><Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="op-name-input" />
            </div>
            <div><Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="op-email-input" />
            </div>
            <div><Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="op-password-input" />
            </div>
            <div><Label>Ruolo</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="op-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operatore</SelectItem>
                  <SelectItem value="admin">Amministratore</SelectItem>
                </SelectContent>
              </Select>
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
