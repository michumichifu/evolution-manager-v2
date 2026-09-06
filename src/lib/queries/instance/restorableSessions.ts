import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGlobal } from "../api";

/**
 * PD 2026-09-06.
 *
 * Un corte de red de 40 segundos hizo que Evolution borrara las credenciales de cinco
 * instancias, y levantarlas parecía costar un código QR por cliente, con el teléfono de
 * cada uno delante. No hizo falta: el backend guarda una copia cada hora y sabe
 * devolverla.
 *
 * Estas dos llamadas son ese botón. El watchdog hace lo mismo solo cada cinco minutos;
 * esto es para no esperar.
 *
 * 🔴 Solo aparecen aquí las que cayeron por un 408 (timeout de red). Con un 401 la sesión
 * está cerrada de verdad y lo honesto es escanear.
 */

export type RestorableSession = {
  instanceId: string;
  instanceName: string;
  number: string | null;
  disconnectedAt: string | null;
  backupSavedAt: string | null;
};

export type RestorableSessionsResponse = {
  restorable: RestorableSession[];
  count: number;
};

export type RestoreResult = {
  results: { instanceName: string; restored: boolean; error?: string }[];
  restored: number;
  requested: number;
};

const queryKey = ["instance", "restorableSessions"];

export const fetchRestorableSessions = async (): Promise<RestorableSessionsResponse> => {
  const response = await apiGlobal.get("/instance/restorableSessions");
  return response.data;
};

export const useRestorableSessions = () =>
  useQuery<RestorableSessionsResponse>({
    queryKey,
    queryFn: fetchRestorableSessions,
    // Una credencial no se borra sola cada minuto: mirar de vez en cuando es suficiente.
    refetchInterval: 60_000,
    retry: false,
  });

export const useRestoreSessions = () => {
  const queryClient = useQueryClient();

  return useMutation<RestoreResult, Error, string[] | undefined>({
    mutationFn: async (instanceNames) => {
      const response = await apiGlobal.post("/instance/restoreSessions", {
        instanceNames: instanceNames ?? [],
      });
      return response.data;
    },
    onSuccess: () => {
      // La lista de instancias cambia con esto: si no se refresca, la pantalla sigue
      // enseñando como caída una que acaba de volver.
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["instance", "fetchInstances"] });
    },
  });
};
