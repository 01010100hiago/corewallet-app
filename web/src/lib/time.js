// Quanto falta para uma data, em texto curto: "47 min", "menos de 1 min", "1 h 5 min".
export function timeLeftLabel(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "venceu";
  const minutes = Math.ceil(ms / 60000);
  if (ms < 60000) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
