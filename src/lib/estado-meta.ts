import { Instance } from "@/types/evolution.types";

/**
 * PD 2026-10-03: el estado de una instancia Cloud API según Meta.
 *
 * Una Cloud API no tiene socket y el backend la daba «open» siempre: «Zenithe 2 - Cloud Api»
 * salió «Conectado» dos días con el número fuera de internet y la app sin acceso (code 100/33).
 * Ahora el backend le pregunta a Meta cada 30 min (`salud-meta.service.ts` de evolution-api) y
 * `fetchInstances` trae el resultado: si el número no funciona, `connectionStatus` ya llega
 * "close", así que el distintivo y el filtro «Estado» salen bien sin tocar nada más. Aquí solo se
 * decide QUÉ texto va debajo y de qué color.
 */
export const esCloudApi = (instance?: Pick<Instance, "integration"> | null) =>
  (instance?.integration || "").toUpperCase() === "WHATSAPP-BUSINESS";

export type AvisoMeta = {
  /** El motivo en español, tal cual lo da el backend. */
  texto: string;
  /** Rojo si Meta dice que el número NO funciona; ámbar si es un aviso (calidad, sin comprobar). */
  grave: boolean;
};

export function avisoMeta(instance: Instance): AvisoMeta | null {
  if (!esCloudApi(instance) || !instance.metaMotivo) return null;
  return { texto: instance.metaMotivo, grave: instance.metaConnected === false };
}

/** «hace 5 min», «hace 3 h», «hace 2 días»: cuándo contestó Meta por última vez. */
export function haceCuanto(iso?: string | null, ahora: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.round((ahora.getTime() - t) / 60000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
