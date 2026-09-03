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
import { ChevronsUpDown, Layers, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { InstanceCard } from "@/components/instance-card";

import { useFetchInstances } from "@/lib/queries/instance/fetchInstances";
import { useManageInstance } from "@/lib/queries/instance/manageInstance";

import { Instance } from "@/types/evolution.types";

import { NewInstance } from "./NewInstance";

function Dashboard() {
  const { t } = useTranslation();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Instance | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [searchStatus, setSearchStatus] = useState("all");
  const [refreshInfoOpen, setRefreshInfoOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { deleteInstance, logout } = useManageInstance();
  const { data: instances, isLoading, refetch } = useFetchInstances();

  const resetTable = async () => {
    await refetch();
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteConfirmText("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    setDeletingName(name);
    try {
      try {
        await logout(name);
      } catch (error) {
        console.error("Error logout:", error);
      }
      await deleteInstance(name);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await resetTable();
      toast.success(t("toast.instance.deleted", { defaultValue: "Instância removida com sucesso!" }));
      closeDeleteModal();
    } catch (error: unknown) {
      console.error("Error instance delete:", error);
      const message = error instanceof Error ? error.message : "Erro ao remover instância";
      toast.error(message);
    } finally {
      setDeletingName(null);
    }
  };

  const filteredInstances = useMemo(() => {
    let list = instances ?? [];
    if (searchStatus !== "all") {
      list = list.filter((i) => i.connectionStatus === searchStatus);
    }
    const q = nameSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => i.name.toLowerCase().includes(q) || (i.profileName && i.profileName.toLowerCase().includes(q)));
  }, [instances, nameSearch, searchStatus]);

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
              />
            ))}
          </div>
        )}
      </div>

      <NewInstance resetTable={resetTable} open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && closeDeleteModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" />
              {t("modal.delete.title")}
            </DialogTitle>
            <DialogDescription>
              {t("modal.delete.message", { instanceName: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>

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
                Al hacer clic en <b>Actualizar</b>, el sistema realiza una sincronización en vivo con <b>Evolution API</b> y <b>Meta Graph API</b> para refrescar:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
                <li><b>Estado de conexión:</b> Verifica si cada WhatsApp está conectado o desconectado en tiempo real.</li>
                <li><b>Contadores de actividad:</b> Actualiza los números de mensajes recibidos, enviados y chats activos.</li>
                <li><b>Datos de perfil y foto oficial:</b> Vuelve a consultar a Meta para cargar los nombres verificados y logos actualizados.</li>
              </ul>
              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground border border-sidebar-border">
                💡 <b>Operación 100% segura:</b> Esta acción solo actualiza la pantalla. <b>No reinicia el servidor</b>, no corta ninguna llamada ni desconecta a tus clientes ni bots de n8n.
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
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await resetTable();
                  toast.success("¡Lista de instancias actualizada correctamente!");
                  setRefreshInfoOpen(false);
                } catch (err) {
                  toast.error("Error al actualizar la lista de instancias");
                } finally {
                  setIsRefreshing(false);
                }
              }}
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
