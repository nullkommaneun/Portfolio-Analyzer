# eToro PDF Analyzer (Client-only)

**Stand:** 2025-10-01

- Läuft komplett lokal im Browser (GitHub Pages genügt).
- Parser auf deutschsprachige eToro-Kontoauszüge zugeschnitten (Muster angepasst).
- Export: JSON und CSV.

## Deployment
1. Repo anlegen, Ordnerinhalt pushen.
2. GitHub Pages aktivieren (Branch `main`, Ordner `/root`).
3. Seite öffnen, PDF hochladen.

## Hinweise
- Parser verwendet Heuristiken. Bei Layoutänderungen ggf. `app/parse/etoro-pdf-parser.js` anpassen.
- Für XIRR werden echte Cashflows benötigt (derzeit Platzhalter).

## Datenschutz
Alle Daten bleiben im Browser. Keine externen Requests außer CDN (pdf.js, chart.js). Auf Wunsch Bibliotheken lokal spiegeln.
