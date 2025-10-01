export function normalizeAll(raw) {
  // Optional: weitere Normalisierung / Cashflows aufbauen
  const cashflows = []; // später aus Transaktionen extrahieren
  return { ...raw, cashflows };
}
