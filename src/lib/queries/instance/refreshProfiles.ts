import { apiGlobal } from "../api";

/**
 * PD 2026-09-14.
 *
 * El botón «Actualizar» solo volvía a leer la lista de la base, y la base solo recibe el
 * nombre y la foto de una cuenta cuando la instancia se CONECTA. Un nombre cambiado en el
 * teléfono no llegaba nunca; la foto parecía llegar porque entraba con la siguiente
 * reconexión. Esta llamada le pregunta a WhatsApp (QR) o a Meta (Cloud API) y guarda.
 *
 * 🔴 En Cloud API el nombre es el que Meta APROBÓ: mientras un cambio está en revisión
 * (`nameStatus: "PENDING_REVIEW"`) Meta sigue devolviendo el viejo, y eso no se puede forzar.
 */

export type RefreshProfileResult = {
  instanceName: string;
  updated: boolean;
  nameChanged?: boolean;
  pictureChanged?: boolean;
  nameStatus?: string | null;
  skipped?: string;
  error?: string;
  /** PD 2026-10-03: el estado del número en Meta (solo Cloud API). */
  meta?: { metaStatus: string | null; metaCheckedAt: string | null; metaConnected: boolean | null; metaMotivo: string | null };
  before?: { profileName: string | null; profilePicUrl: string | null };
  after?: { profileName: string | null; profilePicUrl: string | null };
};

export type RefreshProfilesResponse = {
  results: RefreshProfileResult[];
  updated: number;
  requested: number;
};

export const refreshProfiles = async (instanceNames?: string[]): Promise<RefreshProfilesResponse> => {
  // Una instancia por QR pide la sincronización a WhatsApp y otra la foto: con nueve
  // instancias los 30 s por defecto de apiGlobal se quedan cortos.
  const response = await apiGlobal.post("/instance/refreshProfiles", { instanceNames: instanceNames ?? [] }, { timeout: 120_000 });
  return response.data;
};
