import { Badge } from "@evoapi/design-system/badge";
import { Button } from "@evoapi/design-system/button";
import { Card, CardContent } from "@evoapi/design-system/card";
import { FlaskConical, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { TestInteractiveModal } from "@/components/test-interactive-modal";
import { TooltipWrapper } from "@/components/ui/tooltip";

import { Instance } from "@/types/evolution.types";

const StatusBadge = ({ status }: { status?: string }) => {
  const { t } = useTranslation();
  if (status === "open") return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">{t("status.open")}</Badge>;
  if (status === "connecting") return <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">{t("status.connecting")}</Badge>;
  return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">{t("status.closed")}</Badge>;
};

interface InstanceCardProps {
  instance: Instance;
  isDeleting?: boolean;
  onDelete: (instance: Instance) => void;
}

export function InstanceCard({ instance, isDeleting, onDelete }: InstanceCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [testOpen, setTestOpen] = useState(false);
  const [dynProfile, setDynProfile] = useState<{ name?: string; pic?: string } | null>(null);
  const numberFormatter = new Intl.NumberFormat(i18n.language);

  // Auto-consultar Meta si es Cloud API y le falta el nombre o la foto
  useEffect(() => {
    if (
      instance.integration === "WHATSAPP-BUSINESS" &&
      (!instance.profilePicUrl || !instance.profileName) &&
      instance.number &&
      instance.token
    ) {
      Promise.allSettled([
        fetch(`https://graph.facebook.com/v21.0/${instance.number}?fields=verified_name`, {
          headers: { Authorization: `Bearer ${instance.token}` },
        }).then((r) => (r.ok ? r.json() : null)),
        fetch(`https://graph.facebook.com/v21.0/${instance.number}/whatsapp_business_profile?fields=profile_picture_url`, {
          headers: { Authorization: `Bearer ${instance.token}` },
        }).then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([infoRes, picRes]) => {
          const name = infoRes.status === "fulfilled" && infoRes.value ? infoRes.value.verified_name : undefined;
          const pic =
            picRes.status === "fulfilled" && picRes.value?.data?.[0]
              ? picRes.value.data[0].profile_picture_url
              : undefined;
          if (name || pic) {
            setDynProfile({ name, pic });
          }
        })
        .catch(() => {});
    }
  }, [instance.integration, instance.number, instance.token, instance.profilePicUrl, instance.profileName]);

  const displayName = dynProfile?.name || instance.profileName || instance.name;
  const picUrl = dynProfile?.pic || instance.profilePicUrl;
  const goToInstance = () => navigate(`/manager/instance/${instance.id}/dashboard`);
  const canTest = instance.connectionStatus === "open";

  return (
    <Card className="group relative overflow-hidden border-sidebar-border bg-sidebar py-0 gap-0 transition-all duration-300 hover:bg-sidebar-accent/30 hover:shadow-lg hover:shadow-black/10">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={goToInstance}
          className="flex w-full flex-col border-b border-sidebar-border p-4 pt-3.5 text-left gap-2.5"
        >
          {/* Encima del logo: Nombre del perfil de WhatsApp a ancho completo */}
          <div className="w-full">
            <h3 className="truncate text-base font-semibold text-sidebar-foreground" title={displayName}>
              {displayName}
            </h3>
          </div>

          {/* Fila con el Logo a la izquierda, y a su derecha: Etiqueta Conectado/Desconectado y Nombre de la Instancia */}
          <div className="flex w-full items-center gap-3">
            {picUrl ? (
              <div className="flex-shrink-0">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  <img
                    src={picUrl}
                    alt={displayName}
                    className="h-12 w-12 rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-muted-foreground">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <StatusBadge status={instance.connectionStatus} />
              </div>
              <p className="truncate text-xs font-medium text-sidebar-foreground/80" title={instance.name}>
                {instance.name}
              </p>
            </div>
          </div>
        </button>

        <div className="space-y-1 px-4 py-3 text-xs text-sidebar-foreground/70">
          {instance.ownerJid ? (
            <div className="flex items-center justify-between">
              <span>{t("dashboard.card.phone", { defaultValue: "Número" })}</span>
              <span className="ml-2 truncate font-mono">{instance.ownerJid.split("@")[0]}</span>
            </div>
          ) : instance.number ? (
            <div className="flex items-center justify-between">
              <span>Phone ID</span>
              <span className="ml-2 truncate font-mono">{instance.number}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span>{t("instance.dashboard.contacts")}</span>
            <span className="font-mono">{numberFormatter.format(instance._count?.Contact || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("instance.dashboard.messages")}</span>
            <span className="font-mono">{numberFormatter.format(instance._count?.Message || 0)}</span>
          </div>
        </div>

        <div className="flex border-t border-sidebar-border opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Button
            variant="ghost"
            className="h-12 flex-1 rounded-none text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={goToInstance}
          >
            <Settings className="mr-2 h-4 w-4" />
            {t("dashboard.settings")}
          </Button>
          <div className="w-px bg-sidebar-border" />
          <TooltipWrapper
            content={
              canTest
                ? t("testInteractive.title", { defaultValue: "Probar mensajes interactivos" })
                : t("testInteractive.requiresOpen", { defaultValue: "Requiere instancia conectada" })
            }
          >
            <Button
              variant="ghost"
              className="h-12 rounded-none px-4 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              disabled={!canTest}
              onClick={() => setTestOpen(true)}
            >
              <FlaskConical className="h-4 w-4" />
            </Button>
          </TooltipWrapper>
          <div className="w-px bg-sidebar-border" />
          <TooltipWrapper content={t("button.delete", { defaultValue: "Eliminar instancia" })}>
            <Button
              variant="ghost"
              className="h-12 rounded-none px-4 text-red-500 hover:bg-red-500/10 hover:text-red-400"
              disabled={isDeleting}
              onClick={() => onDelete(instance)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipWrapper>
        </div>
      </CardContent>

      <TestInteractiveModal instance={instance} open={testOpen} onOpenChange={setTestOpen} />
    </Card>
  );
}
