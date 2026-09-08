# Despliegue del Manager (Proyección Digital)

Este repo es **el Manager de Evolution con nuestros parches**, rama **`deploy/parches-pd`**. Lo que
corre en `https://evolution.proyecciondigital.org/manager/` sale **de aquí**, no de la imagen oficial.

> El backend tiene su propio documento: `/home/lu/Proyectos/evolution-api/DESPLIEGUE-PD.md`.
> El caso que originó los tres parches del 8 sep 2026 está contado entero en
> `Documentacion/INFORME - Evolution API como hub central de WhatsApp y la correccion del webhook del WABA de Zenithe (7 sep 2026).md`
> de la carpeta de la agencia (secciones 12-14 y anexo G).

## 1. Cómo llega a producción

La imagen oficial trae su propio Manager y **nosotros lo tapamos con un montaje**, igual que el
backend. En el `docker-compose.yml` de `/opt/evolution-api/` (VPS2, `root@89.117.73.129`):

```
/opt/evolution-api/dist-parcheado  ->  /evolution/dist          (ro)   repo evolution-api
/opt/evolution-api/manager-dist    ->  /evolution/manager/dist  (ro)   este repo
```

## 2. El procedimiento, entero

**El orden es repo → commit → compilar → desplegar → documentar.** Nunca al revés.

```bash
cd /home/lu/Proyectos/evolution-manager-v2          # rama deploy/parches-pd
npx eslint <los archivos tocados>                   # 🔴 por ARCHIVOS, no por directorio
npm run type-check                                  # tsc --noEmit
npm run build                                       # tsc -b && vite build  (~6-12 s)

# respaldo de lo que hay en vivo, antes de pisarlo
ssh root@89.117.73.129 'cd /opt/evolution-api && tar czf /root/manager-dist-respaldo-$(date +%Y%m%d).tgz manager-dist'

rsync -a --delete dist/ root@89.117.73.129:/opt/evolution-api/manager-dist/

# la comprobación: qué bundle sirve producción
curl -s https://evolution.proyecciondigital.org/manager/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

🔴 **NO hace falta reiniciar el contenedor.** El Manager son archivos estáticos que el backend sirve
del disco montado: el cambio está en vivo en cuanto termina el `rsync`. **El backend es al revés** —
ahí sí hay que reiniciar, porque **Node lee `main.js` al arrancar**—. Por eso un despliegue del
Manager **no toca las instancias de WhatsApp** y se puede hacer con campañas corriendo.

🔴 **Que el `rsync` termine bien no prueba nada.** Vite le pone un **hash al nombre del bundle** en
cada build, así que ese `curl` debe devolver **un nombre distinto del anterior**. Si devuelve el
mismo, producción sigue con el viejo.

🔴 **El `dist` del servidor NO se edita a mano**: no lo sabe nadie y se pierde en la siguiente
actualización.

⚠️ **Al actualizar Evolution de versión, el montaje tapa el Manager nuevo de la imagen y nada avisa.**
Hay que rehacer la rama sobre el tag nuevo y volver a compilar.

## 3. La vuelta atrás

```bash
ssh root@89.117.73.129 'cd /opt/evolution-api && rm -rf manager-dist && tar xzf /root/manager-dist-respaldo-<fecha>.tgz'
```

`/root/manager-dist-respaldo-20260908.tgz` guarda el `manager-dist` anterior a los tres parches del
8 de septiembre (bundle `index-BlJ72MkZ.js`).

## 4. Los parches propios, en orden

| Commit | Qué arregla | Bundle desplegado |
|---|---|---|
| `f1d6e8c` | **No pide una foto de perfil cuya URL ya caducó.** Las de `pps.whatsapp.net` llevan el vencimiento en el parámetro `oe` (epoch en hex) y dan **403** al pasar. Las instancias por QR refrescan su foto al reconectar; **las de Cloud API no**. | `index-3jxkiSu7.js` |
| `5ac2ae5` | **Calla el WebSocket apagado y sirve los logos en local.** El servidor no tiene `WEBSOCKET_ENABLED`, así que el front reintentaba sin parar; y los logos se pedían a `evolution-api.com`, que responde 404. | `index-Be4Rm72u.js` |
| `0f2aa0b` | **Un chat sin `remoteJid` tumbaba toda la vista** (`Cannot read properties of null`): el filtro de `visibleChats` hace `c.remoteJid.includes(...)`. Se descartan en el origen. | `index-CBHulojv.js` |
| `bc6855b` | El logo desaparecía al caducar la URL que da Meta: `cache: "no-store"` y, si una foto falla, **se prueba la siguiente candidata** en vez de esconderla. | — |
| `0b52e96` | **Botón para recuperar sesiones sin código QR** (pareja del endpoint del backend, `a039a65c`). | — |

## 5. Trampas medidas (no repetirlas)

- 🔴 **`eslint` se pasa por archivos, no por directorio**: con el directorio no ve lo mismo.
- 🔴 **Al insertar código a nivel de módulo, mirar dónde cae respecto a `export function`**: el 8 sep
  una inserción quedó **entre `export` y `function`** y dejó el componente sin exportar. Lo cazó
  `eslint` con «'InstanceCard' is defined but never used», que parecía otra cosa.
- 🔴 **Un arreglo se prueba REPRODUCIENDO el fallo, no limpiando el dato.** Para el `0f2aa0b` se
  reinsertó en producción el mensaje que lo provocaba, se comprobó que la pantalla cargaba y se
  volvió a borrar. Comprobar solo que «ya no falla» con el dato limpio no habría probado nada.
- 🔴 **El Manager manda el token de la instancia desde el navegador** para preguntarle el perfil a
  Meta. Funciona, pero esa consulta la haría mejor el servidor.
- ⚠️ **Encender el WebSocket exige `WEBSOCKET_GLOBAL_EVENTS`** —el Manager escucha el canal global, no
  el de la instancia— y el `allowRequest` del backend **admite conexiones sin apikey** según
  `WEBSOCKET_ALLOWED_HOSTS`. Decisión de Luis del 8 sep 2026: **no se enciende**.
