import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Camera, Keyboard, Plus, Minus, Package2, Wine, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Scansione() {
  const scannerRef = useRef(null);
  const containerId = "qr-reader";
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState(null); // {kind,item,group_name}
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("Entrata merce");
  const [recent, setRecent] = useState([]);

  const stop = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (_e) { /* ignore */ }
      try { await scannerRef.current.clear(); } catch (_e) { /* ignore */ }
      scannerRef.current = null;
    }
    setCameraOn(false);
  };

  useEffect(() => () => { stop(); // eslint-disable-next-line
  }, []);

  const onDetected = async (code) => {
    await stop();
    await lookup(code);
  };

  const startCamera = async () => {
    try {
      setResult(null);
      const h5 = new Html5Qrcode(containerId, /* verbose= */ false);
      scannerRef.current = h5;
      setCameraOn(true);
      await h5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 180 } },
        (text) => onDetected(text),
        () => {}
      );
    } catch (e) {
      setCameraOn(false);
      toast.error("Impossibile avviare la fotocamera. Verifica i permessi del browser.");
    }
  };

  const lookup = async (code) => {
    try {
      const { data } = await api.get(`/scan/${encodeURIComponent(code)}`);
      setResult(data);
      toast.success(`Trovato: ${data.item.name}`);
    } catch (e) {
      setResult({ kind: "notfound", code });
      toast.error(formatApiError(e));
    }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    await lookup(manual.trim());
    setManual("");
  };

  const applyAdjust = async (sign) => {
    if (!result || result.kind === "notfound") return;
    try {
      const code = result.item.barcode;
      const d = Math.abs(Number(delta)) * sign;
      const { data } = await api.post("/scan/adjust", { code, quantity_delta: d, reason });
      setResult(data);
      setRecent((r) => [{
        id: `${Date.now()}`, name: data.item.name, delta: d,
        kind: data.kind, time: new Date().toLocaleTimeString("it-IT")
      }, ...r].slice(0, 10));
      toast.success(`Scorta aggiornata: ${data.item.name} ${d > 0 ? "+" : ""}${d}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="scansione-root">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Operazioni rapide</div>
        <h1 className="font-serif-display text-4xl text-stone-900 flex items-center gap-3">
          <ScanLine className="w-7 h-7 text-stone-500" /> Scansione codice
        </h1>
        <p className="text-stone-500 mt-2">Inquadra il codice (QR o barcode) di una bottiglia o cartone per aggiornare la scorta.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="card-elevated">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-serif-display text-xl flex items-center gap-2">
                <Camera className="w-5 h-5 text-stone-500" /> Fotocamera
              </div>
              {cameraOn ? (
                <Button variant="outline" onClick={stop} data-testid="stop-scan-btn">Ferma</Button>
              ) : (
                <Button className="btn-wine" onClick={startCamera} data-testid="start-scan-btn">
                  <Camera className="w-4 h-4 mr-2" /> Avvia
                </Button>
              )}
            </div>
            <div id={containerId} className="rounded-md overflow-hidden bg-stone-900 min-h-[260px] flex items-center justify-center text-stone-500 text-sm">
              {!cameraOn && "La fotocamera apparirà qui"}
            </div>

            <form onSubmit={submitManual} className="pt-2 border-t border-stone-200 space-y-2">
              <Label className="flex items-center gap-2 text-stone-700"><Keyboard className="w-4 h-4" /> Oppure inserisci manualmente</Label>
              <div className="flex gap-2">
                <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Codice articolo…" data-testid="manual-code-input" />
                <Button type="submit" variant="outline" data-testid="manual-lookup-btn">Cerca</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="p-6 space-y-4">
            <div className="font-serif-display text-xl">Articolo rilevato</div>

            {!result && (
              <div className="text-sm text-stone-500 py-8 text-center">
                Nessun codice ancora scansionato.<br />
                Suggerimento: imposta un <b>codice</b> univoco per ogni articolo nel suo dettaglio.
              </div>
            )}

            {result?.kind === "notfound" && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-4 text-sm" data-testid="scan-not-found">
                <b>Codice non trovato:</b> <span className="font-mono-num">{result.code}</span>
                <div className="text-xs mt-1 text-amber-800">Associa questo codice a un articolo nella sezione Materie Prime o Prodotti Finiti.</div>
              </div>
            )}

            {result && result.kind !== "notfound" && (
              <div className="space-y-4" data-testid="scan-result">
                <div className="flex items-start justify-between bg-stone-50 border border-stone-200 rounded-md p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: result.kind === "raw" ? "#6B1D2F14" : "#B4530914", color: result.kind === "raw" ? "#6B1D2F" : "#B45309" }}>
                      {result.kind === "raw" ? <Package2 className="w-5 h-5" /> : <Wine className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider text-stone-500">{result.kind === "raw" ? "Materia prima" : "Prodotto finito"} · {result.group_name}</div>
                      <div className="font-serif-display text-lg text-stone-900">{result.item.name}</div>
                      <div className="text-xs text-stone-500 font-mono-num mt-0.5">Codice: {result.item.barcode}</div>
                    </div>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Trovato
                  </Badge>
                </div>

                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-stone-500">Scorta attuale</div>
                    <div className="font-mono-num text-3xl font-bold text-stone-900" data-testid="current-stock">
                      {result.item.quantity} <span className="text-stone-400 text-base font-normal">{result.item.unit}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantità</Label>
                    <Input type="number" min="1" value={delta} onChange={(e) => setDelta(e.target.value)} data-testid="delta-input" />
                  </div>
                  <div>
                    <Label>Motivo</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reason-input" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => applyAdjust(+1)} className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white h-11" data-testid="scan-add-btn">
                    <Plus className="w-4 h-4 mr-2" /> Aggiungi
                  </Button>
                  <Button onClick={() => applyAdjust(-1)} variant="outline" className="flex-1 h-11 border-red-200 text-red-700 hover:bg-red-50" data-testid="scan-remove-btn">
                    <Minus className="w-4 h-4 mr-2" /> Scarica
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {recent.length > 0 && (
        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="font-serif-display text-xl mb-3">Operazioni recenti (questa sessione)</div>
            <ul className="divide-y divide-stone-200">
              {recent.map((r) => (
                <li key={r.id} className="py-2 flex justify-between items-center text-sm">
                  <div>
                    <span className="text-stone-500 font-mono-num text-xs mr-3">{r.time}</span>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-stone-400 text-xs ml-2">({r.kind === "raw" ? "materia prima" : "prodotto finito"})</span>
                  </div>
                  <span className={`font-mono-num font-semibold ${r.delta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {r.delta > 0 ? "+" : ""}{r.delta}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
