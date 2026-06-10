import { Button } from "@evoapi/design-system/button";
import { Label } from "@evoapi/design-system/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@evoapi/design-system/select";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { evohubService } from "@/lib/queries/evohub/evohubService";
import { EvoHubUiChannelType, HubChannel, HubChannelType, MetaAppOptions } from "@/types/evolution.types";

type Mode = "new" | "existing";
type ConnectState = "idle" | "creating" | "awaiting-meta-auth" | "connected" | "linking" | "linked";

// Mapping de tipo da UI -> tipo do hub (espelha HUB_TYPE_BY_CHANNEL do CRM)
const HUB_TYPE_BY_CHANNEL: Record<EvoHubUiChannelType, HubChannelType> = {
  whatsapp_cloud: "whatsapp",
  facebook_page: "facebook",
  instagram: "instagram",
};

// FASE 2: trocar para true (ou ler de feature-flag) para habilitar o modo criar-novo.
const PHASE2_CREATE_NEW = false;

// O painel NÃO recebe nem envia token (contrato §1, §5): o token é resolvido server-side
// pelo back-end no link-existing e persistido em Instance.token.
interface EvoHubConnectProps {
  instanceName: string;
  onConnected: () => void;
}

export function EvoHubConnect({ instanceName, onConnected }: EvoHubConnectProps) {
  const { t } = useTranslation();

  const [channelType, setChannelType] = useState<EvoHubUiChannelType>("whatsapp_cloud");
  // FASE 1: inicia em "existing" (caminho funcional). "new" é Fase 2 (atrás da flag).
  const [mode, setMode] = useState<Mode>(PHASE2_CREATE_NEW ? "new" : "existing");

  // shared vs BYO (modo new). Default: shared se permitido.
  const [metaAppMode, setMetaAppMode] = useState<"shared" | string>("shared");
  const [metaOptions, setMetaOptions] = useState<MetaAppOptions | null>(null);

  // canais disponíveis (modo existing)
  const [availableChannels, setAvailableChannels] = useState<HubChannel[]>([]);
  const [selectedHubChannelId, setSelectedHubChannelId] = useState<string>("");

  const [state, setState] = useState<ConnectState>("idle");
  const [publicLink, setPublicLink] = useState<string | null>(null);

  const submitting = state === "creating" || state === "linking";
  const hubType = HUB_TYPE_BY_CHANNEL[channelType];

  // Preview de opções de Meta App (FASE 2 — modo new). Gateado pela flag para não
  // disparar fetch/toast de uma UI invisível na Fase 1.
  useEffect(() => {
    if (!PHASE2_CREATE_NEW) return;
    let cancelled = false;
    evohubService
      .getMetaAppOptions()
      .then((opts) => {
        if (cancelled) return;
        setMetaOptions(opts);
        if (opts.allowed_modes.includes("shared")) setMetaAppMode("shared");
        else if (opts.byo_credentials.length > 0) setMetaAppMode(opts.byo_credentials[0].id);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("instance.form.evohub.error.load"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Modo existing: buscar canais disponíveis (lazy, só quando mode === 'existing').
  useEffect(() => {
    if (mode !== "existing") return;
    let cancelled = false;
    evohubService
      .getAvailableChannels(hubType)
      .then((chs) => {
        if (!cancelled) setAvailableChannels(chs);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("instance.form.evohub.error.load"));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, hubType, t]);

  // FASE 2 — criar-novo (multi-step, public_link). Só executa com PHASE2_CREATE_NEW=true.
  const handleNew = async () => {
    setState("creating");
    try {
      const res = await evohubService.provisionNew({
        instanceName,
        channelType: hubType,
        metaAppMode,
      });
      if (res.public_link) {
        setPublicLink(res.public_link);
        setState("awaiting-meta-auth");
        window.open(res.public_link, "_blank", "noopener,noreferrer");
      } else {
        setState("connected");
        onConnected();
      }
    } catch {
      setState("idle");
      toast.error(t("instance.form.evohub.error.provision"));
    }
  };

  // FASE 1 — vincular-existente (single-step). Envia só { instanceName, hub_channel_id,
  // channel_type } — sem token (resolvido server-side). A Instance é criada sincronamente.
  const handleExisting = async () => {
    setState("linking");
    try {
      await evohubService.linkExisting({
        instanceName,
        channelType: hubType,
        hubChannelId: selectedHubChannelId,
      });
      setState("linked");
      onConnected();
    } catch {
      setState("idle");
      toast.error(t("instance.form.evohub.error.provision"));
    }
  };

  return (
    <div className="grid gap-4 rounded-md border p-3">
      <span className="text-sm font-medium">{t("instance.form.evohub.title")}</span>

      {/* Tipo de canal */}
      <div className="grid gap-1">
        <Label>{t("instance.form.evohub.channelType.label")}</Label>
        <Select value={channelType} onValueChange={(v) => setChannelType(v as EvoHubUiChannelType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp_cloud">{t("instance.form.evohub.channelType.whatsapp")}</SelectItem>
            <SelectItem value="facebook_page">{t("instance.form.evohub.channelType.facebook")}</SelectItem>
            <SelectItem value="instagram">{t("instance.form.evohub.channelType.instagram")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Modo new/existing. FASE 1: só "existing"; o radio "new" só aparece na Fase 2. */}
      <fieldset className="grid gap-1">
        <legend className="text-sm">{t("instance.form.evohub.mode.label")}</legend>
        {PHASE2_CREATE_NEW && (
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
            {t("instance.form.evohub.mode.new")}
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />
          {t("instance.form.evohub.mode.existing")}
        </label>
      </fieldset>

      {/* shared vs BYO (apenas modo new — FASE 2) */}
      {PHASE2_CREATE_NEW && mode === "new" && metaOptions && (
        <div className="grid gap-1">
          <Label>{t("instance.form.evohub.metaApp.label")}</Label>
          <Select value={metaAppMode} onValueChange={setMetaAppMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metaOptions.allowed_modes.includes("shared") && (
                <SelectItem value="shared">
                  {t("instance.form.evohub.metaApp.shared")} · {t("instance.form.evohub.metaApp.sharedHint")}
                </SelectItem>
              )}
              {metaOptions.byo_credentials.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {t("instance.form.evohub.metaApp.byoHint")} · {c.app_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* canal existente (apenas modo existing) */}
      {mode === "existing" && (
        <div className="grid gap-1">
          <Label>{t("instance.form.evohub.existingChannel.label")}</Label>
          <Select
            value={selectedHubChannelId}
            onValueChange={setSelectedHubChannelId}
            disabled={availableChannels.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("instance.form.evohub.existingChannel.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {availableChannels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableChannels.length === 0 && (
            <span className="text-xs text-muted-foreground">{t("instance.form.evohub.existingChannel.empty")}</span>
          )}
        </div>
      )}

      {/* Ações + estado */}
      {state === "awaiting-meta-auth" && publicLink ? (
        <div className="grid gap-2">
          <span className="text-sm text-muted-foreground">{t("instance.form.evohub.state.awaitingAuth")}</span>
          <Button type="button" variant="outline" onClick={() => window.open(publicLink, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("instance.form.evohub.button.reopen")}
          </Button>
          <Button type="button" onClick={onConnected}>
            {t("instance.form.evohub.state.connected")}
          </Button>
        </div>
      ) : state === "linked" ? (
        <span className="text-sm text-muted-foreground">{t("instance.form.evohub.state.linked")}</span>
      ) : (
        <Button
          type="button"
          disabled={submitting || !instanceName || (mode === "existing" && !selectedHubChannelId)}
          onClick={mode === "new" ? handleNew : handleExisting}
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : mode === "new" ? (
            <ExternalLink className="mr-2 h-4 w-4" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          {submitting
            ? mode === "new"
              ? t("instance.form.evohub.state.creating")
              : t("instance.form.evohub.state.linking")
            : mode === "new"
              ? t("instance.form.evohub.button.connect")
              : t("instance.form.evohub.button.link")}
        </Button>
      )}
    </div>
  );
}
