// PD 2026-09-08: las URLs de `pps.whatsapp.net` llevan su propia caducidad dentro, en el
// parámetro `oe` (epoch en hexadecimal). Pedir una vencida devuelve **403** y ensucia la consola
// sin remedio —el error de red se registra aunque luego se pinte la inicial—, así que la
// candidata se descarta ANTES de intentarla.
//
// Ante la duda se intenta: sin `oe`, o si no se puede leer, la URL se da por buena. Es la única
// forma de que un filtro así no acabe escondiendo fotos que sí funcionan.
export const fotoVigente = (url?: string | null): boolean => {
  if (!url) return false;

  try {
    const oe = new URL(url).searchParams.get("oe");
    if (!oe) return true;

    const vence = parseInt(oe, 16);
    return Number.isNaN(vence) || vence * 1000 > Date.now();
  } catch {
    return true;
  }
};

/** Devuelve la URL solo si sigue viva; si no, `undefined` para que se pinte la inicial. */
export const fotoSiVigente = (url?: string | null): string | undefined => (fotoVigente(url) ? (url as string) : undefined);
