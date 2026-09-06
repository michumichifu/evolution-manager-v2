import { Button } from "@evoapi/design-system/button";
import { KeyRound, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { useRestorableSessions, useRestoreSessions } from "@/lib/queries/instance/restorableSessions";

/**
 * PD 2026-09-06: aviso y botón para devolver credenciales que Evolution borró por un
 * timeout de red.
 *
 * 🔴 No se pinta si no hay nada que restaurar. Un botón siempre visible invita a pulsarlo
 * sin motivo, y este toca la sesión de WhatsApp de un cliente.
 *
 * 🔴 Global, pero NO a ciegas: enseña cuáles son y deja elegir. Las caídas llegan de las
 * dos formas —el 6 sep 2026 cayeron tres de golpe, pero las dos de Zenithe habían caído
 * cada una por su lado—, así que sirve igual para una que para todas.
 */
export function RestorableSessions({ onRestored }: { onRestored?: () => void }) {
  const { t } = useTranslation();
  const { data } = useRestorableSessions();
  const restore = useRestoreSessions();
  const [selected, setSelected] = useState<string[]>([]);

  const restorable = data?.restorable ?? [];

  // Al aparecer una nueva, entra ya marcada: lo normal es quererlas todas de vuelta.
  useEffect(() => {
    setSelected(restorable.map((r) => r.instanceName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.count]);

  if (!restorable.length) return null;

  const alternar = (nombre: string) =>
    setSelected((antes) => (antes.includes(nombre) ? antes.filter((n) => n !== nombre) : [...antes, nombre]));

  const restaurar = async () => {
    try {
      const resultado = await restore.mutateAsync(selected);
      const fallidas = resultado.results.filter((r) => !r.restored);

      if (resultado.restored > 0) {
        toast.success(t("restorable.done", { count: resultado.restored }));
      }
      if (fallidas.length) {
        toast.error(t("restorable.failed", { names: fallidas.map((f) => f.instanceName).join(", ") }));
      }
      onRestored?.();
    } catch (error) {
      toast.error(t("restorable.error"));
      console.error("restoreSessions:", error);
    }
  };

  const fecha = (valor: string | null) => (valor ? new Date(valor).toLocaleString() : "—");

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <h3 className="font-medium text-amber-600 dark:text-amber-400">
            {t("restorable.title", { count: restorable.length })}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("restorable.description")}</p>

          <ul className="mt-3 space-y-2">
            {restorable.map((item) => (
              <li key={item.instanceId} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`restaurar-${item.instanceId}`}
                  checked={selected.includes(item.instanceName)}
                  onChange={() => alternar(item.instanceName)}
                  className="h-4 w-4 accent-amber-500"
                />
                <label htmlFor={`restaurar-${item.instanceId}`} className="font-medium">
                  {item.instanceName}
                </label>
                <span className="text-xs text-muted-foreground">
                  {t("restorable.fellAt")} {fecha(item.disconnectedAt)} · {t("restorable.backupFrom")}{" "}
                  {fecha(item.backupSavedAt)}
                </span>
              </li>
            ))}
          </ul>

          <Button
            size="sm"
            className="mt-4"
            disabled={!selected.length || restore.isPending}
            onClick={restaurar}>
            {restore.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            {t("restorable.button", { count: selected.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}
