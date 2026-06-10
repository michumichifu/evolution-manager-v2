import { apiGlobal } from "../api";

import type {
  EvoHubProvisionResponse,
  HubChannel,
  HubChannelType,
  HubPlan,
  MetaAppOptions,
} from "@/types/evolution.types";

// Extrai data tolerando { data: T } ou T direto (espelha extractData do CRM).
function extractData<T>(response: { data: unknown }): T {
  const d = response.data as { data?: T } | T;
  if (d && typeof d === "object" && "data" in d && (d as { data?: T }).data !== undefined) {
    return (d as { data: T }).data;
  }
  return d as T;
}

// FASE 1 — vincular-existente. SEM token (resolvido server-side).
// channelType = tipo do HUB já mapeado (HubChannelType), não o valor da UI.
interface LinkExistingParams {
  instanceName: string;
  channelType: HubChannelType; // "whatsapp" | "facebook" | "instagram"
  hubChannelId: string;
}

// FASE 2 — criar-novo (public_link). SEM token (channel_token sai do provisionamento).
interface ProvisionNewParams {
  instanceName: string;
  channelType: HubChannelType; // "whatsapp" | "facebook" | "instagram"
  metaAppMode: "shared" | string; // "shared" ou byo_credential_id
}

export const evohubService = {
  // GET /evohub/plan → HubPlan
  async getPlan(): Promise<HubPlan> {
    const response = await apiGlobal.get("/evohub/plan");
    return extractData<HubPlan>(response);
  },

  // GET /evohub/meta-app-options → MetaAppOptions
  async getMetaAppOptions(): Promise<MetaAppOptions> {
    const response = await apiGlobal.get("/evohub/meta-app-options");
    return extractData<MetaAppOptions>(response);
  },

  // GET /evohub/channels → HubChannel[]
  async listChannels(): Promise<HubChannel[]> {
    const response = await apiGlobal.get("/evohub/channels");
    return extractData<HubChannel[]>(response) ?? [];
  },

  // GET /evohub/available-channels?type=... → HubChannel[] (já-vinculados filtrados server-side)
  async getAvailableChannels(type?: HubChannelType): Promise<HubChannel[]> {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    const response = await apiGlobal.get(`/evohub/available-channels${query}`);
    return extractData<HubChannel[]>(response) ?? [];
  },

  // FASE 1 — POST /evohub/link-existing
  // Envia SÓ { instanceName, hub_channel_id, channel_type }. SEM token: o back-end resolve
  // o channel_token + phone_number_id via GET /api/v1/channels/:id (server-side) e cria a
  // Instance local sincronamente. O front nunca vê o token (contrato §1, §4-A).
  async linkExisting(params: LinkExistingParams): Promise<EvoHubProvisionResponse> {
    const response = await apiGlobal.post("/evohub/link-existing", {
      instanceName: params.instanceName,
      hub_channel_id: params.hubChannelId,
      channel_type: params.channelType,
    });
    return extractData<EvoHubProvisionResponse>(response);
  },

  // FASE 2 — POST /evohub/provision (criar-novo, multi-step).
  async provisionNew(params: ProvisionNewParams): Promise<EvoHubProvisionResponse> {
    const response = await apiGlobal.post("/evohub/provision", {
      instanceName: params.instanceName,
      channel_type: params.channelType,
      meta_app_mode: params.metaAppMode,
    });
    return extractData<EvoHubProvisionResponse>(response);
  },
};
