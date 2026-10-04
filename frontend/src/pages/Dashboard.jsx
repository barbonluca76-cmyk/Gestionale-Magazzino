import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Wine, Package2, FileText, Droplets } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

function KPICard({ icon: Icon, label, value, suffix, tid, accent = "#6B1D2F" }) {
  return (
    <Card data-testid={tid} className="card-elevated">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-stone-500">{label}</div>
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: `${accent}14`, color: accent }}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="font-mono-num text-3xl font-bold text-stone-900">
          {value}<span className="text-stone-400 text-base font-normal ml-1">{suffix}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const { data } = await api.get("/dashboard/summary");
      setData(data);
      const total = (data.low_raw?.length || 0) + (data.low_finished?.length || 0);
      if (total > 0) setShowAlert(true);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!data) return <div className="text-stone-500">Caricamento…</div>;

  const lowTotal = (data.low_raw?.length || 0) + (data.low_finished?.length || 0);

  return (
    <div className="space-y-8" data-testid="dashboard-root">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Panoramica</div>
          <h1 className="font-serif-display text-4xl text-stone-900">Dashboard magazzino</h1>
          <p className="text-stone-500 mt-2 max-w-xl">Materie prime, prodotti finiti e movimenti — a colpo d&apos;occhio.</p>
        </div>
        {lowTotal > 0 && (
          <Button
            variant="outline"
            onClick={() => setShowAlert(true)}
            data-testid="open-low-stock-btn"
            className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {lowTotal} articoli in esaurimento
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={Droplets} label="Ettolitri in bottiglia" value={data.total_hl} suffix="HL" tid="kpi-hl" />
        <KPICard icon={Wine} label="Bottiglie pronte" value={data.total_bottles.toLocaleString('it-IT')} suffix="bott." tid="kpi-bottles" accent="#B45309" />
        <KPICard icon={Package2} label="Articoli materie prime" value={data.raw_total} suffix="tipi" tid="kpi-raw" accent="#3F6212" />
        <KPICard icon={FileText} label="Imbottigliamenti mese" value={data.bottling_this_month} suffix="" tid="kpi-month" accent="#1C1917" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="card-elevated">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-xl flex items-center gap-2">
              <Package2 className="w-4 h-4 text-stone-500" /> Materie prime sottoscorta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.low_raw.length === 0 ? (
              <div className="text-sm text-stone-500">Tutte le materie prime sono sopra soglia. ✓</div>
            ) : (
              <ul className="divide-y divide-stone-200" data-testid="low-raw-list">
                {data.low_raw.map((r) => (
                  <li key={r.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-stone-800">{r.name}</div>
                      <div className="text-xs text-stone-500">Soglia min: {r.min_threshold} {r.unit}</div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-300">
                      {r.quantity} {r.unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif-display text-xl flex items-center gap-2">
              <Wine className="w-4 h-4 text-stone-500" /> Prodotti finiti sottoscorta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.low_finished.length === 0 ? (
              <div className="text-sm text-stone-500">Tutti i lotti sono sopra soglia. ✓</div>
            ) : (
              <ul className="divide-y divide-stone-200" data-testid="low-finished-list">
                {data.low_finished.map((r) => (
                  <li key={r.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-stone-800">{r.name}</div>
                      <div className="text-xs text-stone-500">Soglia min: {r.min_threshold} bott.</div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-300">
                      {r.quantity} bott.
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAlert} onOpenChange={setShowAlert}>
        <DialogContent data-testid="low-stock-dialog" className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif-display text-2xl">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Scorte in esaurimento
            </DialogTitle>
            <DialogDescription>
              Alcuni articoli hanno raggiunto o superato la soglia minima.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-auto">
            {data.low_raw.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Materie prime</div>
                <ul className="space-y-2">
                  {data.low_raw.map((r) => (
                    <li key={r.id} className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <span className="text-sm text-stone-800">{r.name}</span>
                      <span className="font-mono-num text-sm text-amber-800">{r.quantity} / {r.min_threshold} {r.unit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.low_finished.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Prodotti finiti</div>
                <ul className="space-y-2">
                  {data.low_finished.map((r) => (
                    <li key={r.id} className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <span className="text-sm text-stone-800">{r.name}</span>
                      <span className="font-mono-num text-sm text-amber-800">{r.quantity} / {r.min_threshold} bott.</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAlert(false)} data-testid="low-stock-close">Chiudi</Button>
            <Link to="/materie-prime"><Button className="btn-wine" data-testid="low-stock-goto">Vai alle materie prime</Button></Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
