import { Button } from "@evoapi/design-system/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@evoapi/design-system/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@evoapi/design-system/skeleton";
import { Check, ChevronsUpDown, Circle, Layers, Loader2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { InstanceCard } from "@/components/instance-card";
import { RestorableSessions } from "@/components/restorable-sessions";

import { useFetchInstances } from "@/lib/queries/instance/fetchInstances";
import { useManageInstance } from "@/lib/queries/instance/manageInstance";
import { refreshProfiles } from "@/lib/queries/instance/refreshProfiles";

import { Instance } from "@/types/evolution.types";

import { NewInstance } from "./NewInstance";

function Dashboard() {
  const { t } = useTranslation();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Instance | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  // 0 = sin empezar · 1 cerrar sesión · 2 borrar · 3 esperar al servidor · 4 hecho · -1 no se borró
  const [deleteStep, setDeleteStep] = useState(0);
  const [nameSearch, setNameSearch] = useState("");
  const [searchStatus, setSearchStatus] = useState("all");
  const [refreshInfoOpen, setRefreshInfoOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { deleteInstance, logout } = useManageInstance();
  const { data: instances, isLoading, refetch } = useFetchInstances();

  const resetTable = async () => {
    await refetch();
  };

  // PD 2026-09-14: antes el botón solo hacía `resetTable()`, que relee la base, y la base
  // solo recibe el nombre y la foto al CONECTAR: un nombre cambiado en el teléfono no llegaba
  // nunca. Ahora se le pregunta a WhatsApp (QR) y a Meta (Cloud API), se guarda y se relee.
  const actualizarPerfiles = async () => {
    setIsRefreshing(true);
    try {
      const { results } = await refreshProfiles();
      await resetTable();
      setRefreshKey((k) => k + 1);

      const cambiadas = results.filter((r) => r.updated).map((r) => r.instanceName);
      const enRevision = results.filter((r) => r.nameStatus === "PENDING_REVIEW");
      const fallidas = results.filter((r) => r.error).map((r) => r.instanceName);

      if (cambiadas.length) {
        toast.success(`Nombre o foto actualizados en: ${cambiadas.join(", ")}`);
      } else {
        toast.info("WhatsApp y Meta devuelven los mismos nombres y fotos que ya se veían");
      }
      enRevision.forEach((r) =>
        toast.info(
          `${r.instanceName}: Meta tiene un nombre nuevo en revisión. Hasta que lo apruebe sigue mostrando «${r.after?.profileName ?? ""}».`,
          { autoClose: 12000 },
        ),
      );
      if (fallidas.length) {
        toast.warn(`No se pudo consultar: ${fallidas.join(", ")}`);
      }
      // PD 2026-10-03: «Actualizar» también repasa el estado de cada Cloud API en Meta. Si alguna
      // no funciona, se dice con su motivo (la tarjeta ya sale «Desconectado» al releer).
      results
        .filter((r) => r.meta?.metaConnected === false)
        .forEach((r) => toast.error(`${r.instanceName}: ${r.meta?.metaMotivo}`, { autoClose: 12000 }));
      setRefreshInfoOpen(false);
    } catch {
      toast.error("No se pudo consultar a WhatsApp y Meta");
    } finally {
      setIsRefreshing(false);
    }
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteStep(0);
  };

  /**
   * PD 2026-10-08: el borrado, paso a paso y a la vista. El backend contesta «Instance deleted» y
   * la borra DESPUÉS, por un evento (`remove.instance`); el refresco que había aquí, 1 s más tarde,
   * seguía recibiéndola y la tarjeta se quedaba en pantalla hasta recargar la pestaña. Luis: «si el
   * servidor tarda en eliminar la instancia, debería salir… una barra de progreso, tal cual, y
   * abajo… eliminando tal, tal, tal. Y luego cuando esté correcto, eliminado 100%, ya uno sabe».
   * El diálogo no dice «eliminada» hasta que el servidor deja de devolverla.
   */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    const id = deleteTarget.id;
    setDeletingName(name);
    try {
      setDeleteStep(1);
      try {
        await logout(name);
      } catch (error) {
        console.error("Error logout:", error);
      }

      setDeleteStep(2);
      await deleteInstance(name);

      // Se oculta por su id: una nueva con el mismo nombre trae otro id y sí se ve.
      setDeleteStep(3);
      setHiddenIds((ids) => [...ids, id]);
      let gone = false;
      for (let i = 0; i < 20 && !gone; i++) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const { data } = await refetch();
        gone = !data?.some((inst) => inst.id === id);
      }
      setHiddenIds((ids) => ids.filter((x) => x !== id));

      if (!gone) {
        // 15 s y el servidor la sigue devolviendo: no se borró. Se dice y vuelve a verse.
        setDeleteStep(-1);
        return;
      }

      // No se cierra solo: Luis (8 oct), «no se alcanza a leer bien lo que hizo, se cierra solo».
      // Se queda en el 100 % con el resumen hasta que se pulsa «Cerrar».
      setDeleteStep(4);
    } catch (error: unknown) {
      console.error("Error instance delete:", error);
      const message = error instanceof Error ? error.message : "Erro ao remover instância";
      toast.error(message);
      setDeleteStep(0);
    } finally {
      setDeletingName(null);
    }
  };

  const filteredInstances = useMemo(() => {
    let list = (instances ?? []).filter((i) => !hiddenIds.includes(i.id));
    if (searchStatus !== "all") {
      list = list.filter((i) => i.connectionStatus === searchStatus);
    }
    const q = nameSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => i.name.toLowerCase().includes(q) || (i.profileName && i.profileName.toLowerCase().includes(q)));
  }, [instances, nameSearch, searchStatus, hiddenIds]);

  const instanceStatuses = [
    { value: "all", label: t("status.all") },
    { value: "close", label: t("status.closed") },
    { value: "connecting", label: t("status.connecting") },
    { value: "open", label: t("status.open") },
  ];

  const totalCount = filteredInstances.length;
  const confirmValid = deleteConfirmText === deleteTarget?.name;

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera del Dashboard con distribución personalizada */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Izquierda: Título y Buscador a su derecha */}
        <div className="flex flex-wrap items-center gap-4 flex-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("dashboard.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("dashboard.subtitle", { defaultValue: "Gerencie suas instâncias WhatsApp" })}</p>
          </div>

          {/* Buscador exactamente a la derecha del título */}
          <div className="relative w-full sm:w-72 md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("dashboard.search")}
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Derecha: Botón Estado -> Botón Actualizar -> Botón + Instancia */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botón Estado */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 active:scale-95 transition-transform duration-150">
                {t("dashboard.status")}
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {instanceStatuses.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s.value}
                  checked={searchStatus === s.value}
                  onCheckedChange={(checked) => {
                    if (checked) setSearchStatus(s.value);
                  }}
                >
                  {s.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Botón Actualizar con efecto de hundimiento (active:scale-95) y pop-up informativo */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 active:scale-95 transition-transform duration-150 shadow-sm"
            onClick={() => setRefreshInfoOpen(true)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? t("button.refreshing", { defaultValue: "Actualizando..." }) : t("button.refresh", { defaultValue: "Actualizar" })}
          </Button>

          {/* Botón + Instancia */}
          <Button
            size="sm"
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-medium active:scale-95 transition-transform duration-150"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("instance.button.create")}
          </Button>
        </div>
      </div>

      {/* PD 2026-09-06: solo se pinta si hay algo que restaurar. Va antes del listado
          porque una credencial perdida manda sobre cualquier otra cosa de la pantalla. */}
      <RestorableSessions onRestored={resetTable} />

      <div className="flex-1">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-sidebar-border p-8 text-center">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">{t("dashboard.empty.title", { defaultValue: "Nenhuma instância encontrada" })}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.empty.description", { defaultValue: "Crie sua primeira instância para começar" })}
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="mt-2">
              <Plus className="mr-2 h-4 w-4" />
              {t("instance.button.create")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredInstances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                isDeleting={deletingName === instance.name}
                onDelete={(inst) => setDeleteTarget(inst)}
                refreshKey={refreshKey}
              />
            ))}
          </div>
        )}
      </div>

      <NewInstance resetTable={resetTable} open={createOpen} onOpenChange={setCreateOpen} />

      {/* Mientras se está borrando (pasos 1 a 3) el diálogo no se puede cerrar. */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !(deleteStep >= 1 && deleteStep <= 3) && closeDeleteModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" />
              {t("modal.delete.title")}
            </DialogTitle>
            <DialogDescription>
              {deleteStep === 0
                ? t("modal.delete.message", { instanceName: deleteTarget?.name ?? "" })
                : t("modal.delete.progress.subtitle", { defaultValue: "Instancia «{{instanceName}}»", instanceName: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>

          {deleteStep === 0 ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("modal.delete.confirm", { defaultValue: "Digite o nome da instância para confirmar:" })}
                </label>
                <Input
                  placeholder={deleteTarget?.name}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
              </div>

              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={closeDeleteModal}>
                  {t("button.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={!confirmValid || deletingName === deleteTarget?.name}
                >
                  {deletingName === deleteTarget?.name ? t("button.deleting") : t("button.delete")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-4" aria-live="polite">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>
                  {deleteStep === 4
                    ? t("modal.delete.progress.done", { defaultValue: "Eliminada" })
                    : deleteStep === -1
                      ? t("modal.delete.progress.failed", { defaultValue: "No se pudo confirmar" })
                      : t("modal.delete.progress.working", { defaultValue: "Eliminando…" })}
                </span>
                <span className="tabular-nums">{deleteStep === -1 ? 75 : deleteStep * 25}%</span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deleteStep === -1 ? 75 : deleteStep * 25}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${deleteStep === -1 ? "bg-red-500" : "bg-primary"}`}
                  style={{ width: `${deleteStep === -1 ? 75 : deleteStep * 25}%` }}
                />
              </div>

              <ul className="space-y-2 text-sm">
                {[
                  t("modal.delete.progress.step1", { defaultValue: "Cerrar la sesión en WhatsApp" }),
                  t("modal.delete.progress.step2", { defaultValue: "Eliminar la instancia" }),
                  t("modal.delete.progress.step3", { defaultValue: "Esperar a que el servidor termine de borrarla" }),
                ].map((label, index) => {
                  const step = index + 1;
                  const reached = deleteStep === -1 ? 3 : deleteStep;
                  const done = reached > step || deleteStep === 4;
                  const failed = deleteStep === -1 && step === 3;
                  const current = !done && !failed && reached === step;
                  return (
                    <li key={label} className={`flex items-center gap-2 ${done || current || failed ? "" : "text-muted-foreground"}`}>
                      {done ? (
                        <Check className="h-4 w-4 shrink-0 text-green-500" />
                      ) : failed ? (
                        <X className="h-4 w-4 shrink-0 text-red-500" />
                      ) : current ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0" />
                      )}
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>

              {deleteStep === 4 && (
                <>
                  <p className="text-sm text-green-500">
                    {t("modal.delete.progress.doneMessage", { defaultValue: "Eliminada al 100 %. El servidor ya no la devuelve." })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("modal.delete.progress.doneDetail", {
                      defaultValue:
                        "Con ella se borraron su sesión de WhatsApp, sus chats, contactos y mensajes guardados en Evolution, y sus ajustes e integraciones. En WhatsApp, el dispositivo vinculado desaparece del teléfono.",
                    })}
                  </p>
                  <DialogFooter>
                    <Button onClick={closeDeleteModal}>{t("button.close", { defaultValue: "Cerrar" })}</Button>
                  </DialogFooter>
                </>
              )}

              {deleteStep === -1 && (
                <>
                  <p className="text-sm text-red-500">
                    {t("modal.delete.progress.failedMessage", {
                      defaultValue: "Pasaron 15 segundos y el servidor todavía devuelve esta instancia. Puede que no se haya borrado: revisa la lista antes de volver a crearla.",
                    })}
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={closeDeleteModal}>
                      {t("button.close", { defaultValue: "Cerrar" })}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Informativo para el Botón Actualizar */}
      <Dialog open={refreshInfoOpen} onOpenChange={setRefreshInfoOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <RefreshCw className="h-5 w-5 text-emerald-500" />
              ¿Qué hace el botón Actualizar?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2 text-sm text-foreground/80 text-left">
              <p>
                Al hacer clic en <b>Actualizar</b> se pregunta en ese momento por cada cuenta y se guarda lo que responda:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
                <li><b>Nombre y foto del perfil:</b> a WhatsApp en las instancias por QR, y a Meta en las de Cloud API.</li>
                <li><b>Estado de conexión y contadores:</b> se vuelven a leer los mensajes, contactos y si cada una está conectada.</li>
                <li><b>Nombre en Cloud API:</b> Meta enseña el nombre que ya APROBÓ. Si hay un cambio en revisión, se avisa y sigue saliendo el anterior hasta que lo apruebe.</li>
              </ul>
              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground border border-sidebar-border">
                💡 <b>Operación segura:</b> no reinicia el servidor ni desconecta ninguna instancia, cliente ni bot de n8n.
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setRefreshInfoOpen(false)}>
              Cerrar
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium active:scale-95 transition-transform duration-150"
              disabled={isRefreshing}
              onClick={actualizarPerfiles}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Actualizando..." : "Actualizar ahora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Dashboard;
