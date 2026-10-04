# PRD — Tenuta Barbon WMS

## Problem statement (original, Italian)
Applicazione utilizzabile su PC o tablet per la gestione del magazzino di un'azienda vinicola.
Login operatori, dashboard con pop-up scorte in esaurimento, 3 sezioni principali:
Materie prime (macrogruppi > tipologie con quantità), Prodotti finiti (macrogruppi > lotti/partite),
Modulo imbottigliamento con calcolo automatico ettolitri (0.20/0.35/0.50/0.75/1.50/3.00 L)
e cartoni (6/12/24), regola: detrazione dal magazzino solo se fornitore = "Tenuta Barbon".
Cronologia movimenti con operatore.

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT auth (Bearer + httpOnly cookie), reportlab per PDF
- Frontend: React 19 + React Router + shadcn/ui + Tailwind + axios + sonner
- Font: Cormorant Garamond (display) + Plus Jakarta Sans (body) + JetBrains Mono (numeri)
- Palette: alabastro (#FAF7F2), bordeaux (#6B1D2F), amber (#B45309), sage (#3F6212)

## User personas
- Admin / Proprietario (Luca Barbon): gestisce operatori, articoli, lotti.
- Operatore cantina: compila imbottigliamenti, aggiusta scorte, consulta cronologia.

## Core requirements (stable)
- Autenticazione operatore con tracciamento in ogni movimento
- Dashboard con KPI (HL, bottiglie, articoli, imbottigliamenti mese) + popup scorte
- CRUD macrogruppi + articoli materie prime + lotti prodotti finiti
- Soglia minima per articolo (personalizzabile)
- Modulo imbottigliamento:
  - HL = (bottiglie × capacità) / 100 — in tempo reale
  - Cartoni = ceil(bottiglie / formato) — suggerito, modificabile
  - Materiale suggerito per gruppo (bottiglie/capsule/etichette/tappi/cartoni), modificabile
  - Fornitore Tenuta Barbon → sottrae dal magazzino
  - Cliente/Conto terzi → NON sottrae, marca materials come not_deducted
  - Credita il lotto prodotto finito scelto (o crea nuovo lotto)
- Cronologia movimenti con filtri operatore/tipo/testo + download PDF per imbottigliamenti
- PDF riepilogativo imbottigliamento (reportlab)

## Implemented (2026-02-04)
- Autenticazione JWT (login/logout/me, gestione operatori admin-only)
- Seed admin: barbonluca76@gmail.com / Barbon2026!
- Seed dati demo: 5 macrogruppi materie prime + 16 articoli; 4 tipologie vino + 6 lotti
- Dashboard con KPI + popup automatico scorte in esaurimento
- Sezioni Materie Prime e Prodotti Finiti con drill-down macrogruppo → tabella
- Modulo imbottigliamento completo con calcoli live e regola fornitore
- Cronologia con filtri e download PDF
- PDF via reportlab con branding bordeaux

## Backlog (next phases)
- P1: ricerca globale, export CSV cronologia, grafici trend produzione mensile
- P1: fotocamera/upload foto per lotti (object storage)
- P2: multi-tenancy / più cantine, firma operatore sul PDF
- P2: notifiche email a fine imbottigliamento (Resend)
- P2: dashboard previsione fabbisogno materie prime
