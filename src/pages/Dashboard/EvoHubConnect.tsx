import { Button } from "@evoapi/design-system/button";
import { Label } from "@evoapi/design-system/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@evoapi/design-system/select";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { evohubService } from "@/lib/queries/evohub/evohubService";
import { HubChannel, HubChannelType, MetaAppOptions } from "@/types/evolution.types";

type Mode = "new" | "existing";
type ConnectState = "idle" | "creating" | "awaiting-meta-auth" | "connected" | "linking" | "linked";

// evolution-api é uma API de WhatsApp — o canal é SEMPRE WhatsApp Cloud.
// (O EvoHub também suporta Facebook/Instagram, mas isso é escopo do CRM, não daqui.)
const HUB_TYPE: HubChannelType = "whatsapp";

// Habilita os DOIS modos: criar canal novo (public_link + OAuth Meta) e vincular existente.
const CREATE_NEW_ENABLED = true;

// O painel NÃO recebe nem envia token (contrato §1, §5): o token é resolvido server-side
// pelo back-end e persistido em Instance.token.
interface EvoHubConnectProps {
  instanceName: string;
  onConnected: () => void;
}

export function EvoHubConnect({ instanceName, onConnected }: EvoHubConnectProps) {
  const { t } = useTranslation();

  // Default: criar-novo quando habilitado; senão, vincular existente.
  const [mode, setMode] = useState<Mode>(CREATE_NEW_ENABLED ? "new" : "existing");

  // shared vs BYO (modo new). Default: shared se permitido.
  const [metaAppMode, setMetaAppMode] = useState<"shared" | string>("shared");
  const [metaOptions, setMetaOptions] = useState<MetaAppOptions | null>(null);

  // canais disponíveis (modo existing)
  const [availableChannels, setAvailableChannels] = useState<HubChannel[]>([]);
  const [selectedHubChannelId, setSelectedHubChannelId] = useState<string>("");

  const [state, setState] = useState<ConnectState>("idle");
  const [publicLink, setPublicLink] = useState<string | null>(null);
  // hub_channel_id do canal recém-provisionado (criar-novo) — usado para finalizar
  // via link-existing depois que o usuário autoriza a Meta.
  const [provisionedChannelId, setProvisionedChannelId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const submitting = state === "creating" || state === "linking";

  // Preview de opções de Meta App (modo new — shared vs BYO).
  useEffect(() => {
    if (!CREATE_NEW_ENABLED) return;
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
      .getAvailableChannels(HUB_TYPE)
      .then((chs) => {
        if (!cancelled) setAvailableChannels(chs);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("instance.form.evohub.error.load"));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, t]);

  // Criar-novo (multi-step, public_link → OAuth Meta).
  const handleNew = async () => {
    setState("creating");
    try {
      const res = await evohubService.provisionNew({
        instanceName,
        channelType: HUB_TYPE,
        metaAppMode,
      });
      // Guarda o hub_channel_id para finalizar via link-existing após o OAuth.
      if (res.hub_channel_id) setProvisionedChannelId(res.hub_channel_id);
      if (res.public_link) {
        setPublicLink(res.public_link);
        setState("awaiting-meta-auth");
        window.open(res.public_link, "_blank", "noopener,noreferrer");
      } else {
        // Sem public_link (canal já ativo): finaliza direto.
        await finalizeNew(res.hub_channel_id ?? null);
      }
    } catch {
      setState("idle");
      toast.error(t("instance.form.evohub.error.provision"));
    }
  };

  // Finaliza o criar-novo APÓS o usuário autorizar a Meta no public_link: reusa o
  // link-existing (que JÁ resolve token + phone_number_id server-side e cria a Instance).
  // Se o canal ainda não tiver phone_number_id (usuário clicou antes de concluir o OAuth),
  // o back-end devolve 422 e avisamos para concluir e tentar de novo.
  const finalizeNew = async (channelId: string | null) => {
    const hubChannelId = channelId ?? provisionedChannelId;
    if (!hubChannelId) {
      toast.error(t("instance.form.evohub.error.provision"));
      return;
    }
    setFinalizing(true);
    try {
      await evohubService.linkExisting({
        instanceName,
        channelType: HUB_TYPE,
        hubChannelId,
      });
      setState("connected");
      onConnected();
    } catch {
      // 422 = canal sem phone_number_id ainda (OAuth não concluído) ou outra falha.
      toast.error(t("instance.form.evohub.error.notAuthorizedYet"));
    } finally {
      setFinalizing(false);
    }
  };

  // Vincular-existente (single-step). Envia só { instanceName, hub_channel_id,
  // channel_type } — sem token (resolvido server-side). A Instance é criada sincronamente.
  const handleExisting = async () => {
    setState("linking");
    try {
      await evohubService.linkExisting({
        instanceName,
        channelType: HUB_TYPE,
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

      {/* Modo new/existing */}
      <fieldset className="grid gap-1">
        <legend className="text-sm">{t("instance.form.evohub.mode.label")}</legend>
        {CREATE_NEW_ENABLED && (
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

      {/* shared vs BYO (apenas modo new) */}
      {CREATE_NEW_ENABLED && mode === "new" && metaOptions && (
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
          {/* Após autorizar a Meta no public_link, finaliza criando a Instance via
              link-existing (resolve token + phone_number_id server-side). */}
          <Button type="button" disabled={finalizing} onClick={() => finalizeNew(null)}>
            {finalizing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            {finalizing ? t("instance.form.evohub.state.linking") : t("instance.form.evohub.button.finalize")}
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
