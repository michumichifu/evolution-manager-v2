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
| `168fe73` (8 oct 2026) | **El borrado de una instancia, paso a paso y con barra de progreso.** Luis: *«si el servidor tarda en eliminar la instancia, debería salir… una barra de progreso, tal cual, y abajo… eliminando tal, tal, tal. Y luego cuando esté correcto, eliminado 100%, ya uno sabe»*. Tras confirmar el nombre, el mismo diálogo enseña los tres pasos con su icono (hecho, en curso, pendiente) y el porcentaje: **cerrar la sesión en WhatsApp (25 %) → eliminar la instancia (50 %) → esperar a que el servidor termine de borrarla (75 %) → «Eliminada al 100 %»**. Mientras dura no se puede cerrar, y **no dice «Eliminada» hasta que `fetchInstances` deja de devolverla** (se pregunta cada 750 ms, 15 s de tope). Si a los 15 s sigue ahí, la barra se pone roja y lo dice, en vez de dar el borrado por bueno. Sustituye al refresco único de `fc869c4` (la fila de abajo), del que conserva ocultar la tarjeta por su id. ⚠️ **El diálogo de confirmación se vio en pantalla (8 oct); la vista de progreso NO**: el agente no borra datos desde el navegador, así que la instancia de prueba se borró por la API. **Queda por ver en el primer borrado real.** Respaldo: `/root/manager-dist-respaldo-20261008-0925.tgz`. | `index-DYFwNaKD.js` |
| `fc869c4` (8 oct 2026) | **Una instancia borrada seguía en la lista hasta recargar la pestaña** (Luis: *«le di a eliminar la instancia… y no se borró de aquí del dashboard. Recargué la pestaña y ahí sí… debería ahí mismo hacer la recarga»*). El backend contesta «Instance deleted» y **la borra después**, por el evento `remove.instance`; el panel refrescaba 1 s más tarde y todavía la recibía (en nginx: `DELETE` a las 09:18:06 y los `fetchInstances` de :06 y :07 con el mismo tamaño). Ahora la tarjeta **se oculta en el momento, por su id** (`hiddenIds`; una nueva con el mismo nombre trae otro id y sí se ve) y se le pregunta al servidor cada 1,5 s hasta que deje de devolverla; si a los 15 s sigue ahí, no se borró y se vuelve a mostrar. Medido: una instancia vacía desaparece de `fetchInstances` a los 766 ms; una con historial tarda más. ⚠️ Comprobado por el texto dentro del bundle en vivo; **en pantalla no se miró**. Respaldo: `/root/manager-dist-respaldo-20261008-0923.tgz`. | `index-BwbjFCXi.js` |
| `3cc6f40` (8 oct 2026) | 🔴 **El código de emparejamiento se quedaba viejo en pantalla, o con la rueda girando.** El diálogo pedía el código una vez y enseñaba ese para siempre, aunque el backend lo cambia en cada ciclo de QR (~45 s): quien tardaba en escribirlo metía uno vencido. Y si la petición volvía sin código, la rueda no paraba nunca (pasó la noche del 8 oct con una clienta de Dento Estetic esperando). Ahora: el diálogo es controlado (`pairingDialogOpen`) y **se refresca cada 5 s** mientras está abierto (`PAIRING_CODE_REFRESH_INTERVAL_MS`); debajo del código avisa de que cambia solo; si la primera petición no trae código, lo dice («No se pudo generar el código. Cierra esta ventana y vuelve a intentarlo»). Los refrescos —también el del QR— **ya no borran lo que hay en pantalla ni bloquean los botones** (`handleConnect(…, refresh)`). El refresco es seguro porque el backend, con una generación del mismo tipo en curso, devuelve el código vigente **sin abrir otra conexión** (medido: 3 peticiones seguidas, el mismo código y 0 sockets nuevos). 🔴 **Depende del backend del 8 oct** (`evolution-api`, «Vincular por QR o por código»): con el anterior, pedir el código con un QR abierto devolvía `pairingCode: null`. ⚠️ **Comprobado por la API y por el texto dentro del bundle en vivo; el diálogo en pantalla no se miró.** Respaldo: `/root/manager-dist-respaldo-20261008-0844.tgz`. | `index-ebd9qxvd.js` (antes `index-B8gms99a.js`) |
| `7b4d89a` + `e8662f8` (3 oct 2026) | 🔴 **Una Cloud API salía «Conectado» siempre**, y «Zenithe 2 - Cloud Api» lo estuvo dos días con el número fuera de internet y la app sin acceso en Meta (code 100/33). Luis: *«tiene que indicar realmente que esa instancia está desconectada»*. Ahora el **backend** le pregunta a Meta cada 30 min y `fetchInstances` trae el resultado (apartado «El estado real de una Cloud API según Meta» del `DESPLIEGUE-PD.md` de `evolution-api`): si el número no funciona, `connectionStatus` **ya llega `close`**, así que el distintivo dice **«Desconectado»** y el filtro «Estado» la cuenta. La tarjeta pone debajo **el motivo en español** (rojo; ámbar si es solo un aviso, como calidad baja), **«Meta 100/33 · visto caído desde …»**, el **último cambio** (código anterior → nuevo, hora de RD) y el **último aviso de cuenta** de Meta; una fila «Meta» dice cuándo se comprobó (el error de Graph, en el tooltip). **«Número»** es el `display_phone_number` del backend: **en una Cloud API ya no sale el Phone ID como número** (tiene su fila). La página de la instancia **no ofrece QR** a una Cloud API caída: dice el motivo, el error con `type` y `fbtrace_id`, desde cuándo, cuándo funcionaba y el «Historial de Meta». «Actualizar» avisa de las caídas. 🔴 **La tarjeta ya NO llama a Graph desde el navegador** (el token de la instancia ya no viaja al navegador para esto). ⚠️ **Se despliega DESPUÉS del backend**: sin él, una Cloud API sale sin número visible, sin el nombre aprobado por Meta y sin estado de Meta. | `index-B8gms99a.js` (🟢 desplegado el 3 oct 2026 ~03:35 RD, después del backend; producción lo sirve; respaldo `manager-dist-respaldo-…-pre-salud-meta.tgz`) |
| `d5715e9` (27 sep 2026) | **El reproductor de audio salía como una raya blanca**: la burbuja toma el ancho de su contenido y el `w-full` del `<audio>` daba 0. Ancho fijo de 280 px (tope 100 %). 🔴 Dentro de una burbuja de ancho automático, un control sin contenido propio necesita ancho fijo. | `index-WsTUAfN-.js` |
| `ea329b6` (27 sep 2026) | **Foto, video y audio con su archivo pedido a Evolution.** Lo recibido por la Cloud API (sin S3) se guarda sin `base64` ni `mediaUrl` (`7852b4e5` del backend), y el chat decía «Audio couldn't be loaded». `useArchivoDelMensaje` lo pide con `POST /chat/getBase64FromMediaMessage/:instancia` al pintar el mensaje; el audio se reproduce como `audio/ogg` (antes `audio/mpeg` fijo, y una nota de voz no sonaba). Si Meta ya no lo tiene (~30 días), lo dice en español. | `index-B90trvHc.js` |
| `2a64575` (27 sep 2026) | **La tarjeta del anuncio en el orden de WhatsApp** (Luis: *«mismo orden como te lo mostré en la captura de pantalla de WhatsApp»*): el rótulo «Mensaje a partir de un anuncio» arriba, la tarjeta (imagen con el logo, título, texto en una línea, el dominio del enlace) y debajo el mensaje. Sin la bienvenida, que la tarjeta del teléfono tampoco lleva. | `index-SM_B52Cz.js` |
| `33bc6fa` (27 sep 2026) | **La tarjeta del anuncio, como la de WhatsApp.** La imagen iba recortada en banner (`h-28 object-cover`): ahora entera (`object-contain`, hasta 320 px de alto; la Cloud API manda un cuadrado de 306 px). Y **el logo de Facebook o Instagram abajo a la derecha de la imagen** (Luis: *«sobre la imagen, en el borde derecho inferior, sale un logo de Facebook»*), deducido como lo hace WhatsApp: `entryPointConversionApp` o el enlace del anuncio. Sin imagen, el logo va a la derecha de «Ver el anuncio». | `index-DhId_I23.js` |
| `0c02f1b` (27 sep 2026) | **El chat no enseñaba de qué anuncio venía quien escribe.** El backend lo guarda en `contextInfo.externalAdReply` (Baileys, y la Cloud API desde `a3e2293d` de `evolution-api`) y `findMessages` ya lo devolvía. `TarjetaDeAnuncio`, encima del mensaje entrante: imagen (con `fotoSiVigente`, porque la de Meta caduca), título, texto, **bienvenida** y **«Ver el anuncio»**. Luis: *«Si igual lo recibe, deberíamos hacer que se vea»*. Respaldo: `/root/manager-dist-respaldo-20260927-pre-anuncio.tgz`. | `index-DA7X058t.js` |
| `c22a505` (14 sep 2026) | **El botón «Actualizar» del dashboard no actualizaba nada**: solo hacía `refetch()` de `fetchInstances`, que lee la base, mientras su ventana decía que «vuelve a consultar a Meta». Y la base solo recibe el nombre y la foto **al conectar**: un nombre cambiado en el teléfono no llegaba nunca, y la foto parecía llegar porque entraba con la siguiente reconexión. Ahora llama a `POST /instance/refreshProfiles` del backend (`8f7c6bff`), que pregunta a WhatsApp o a Meta y guarda, y dice qué cambió. 🔴 **La consulta a Meta de las tarjetas Cloud API tampoco se repetía** (su `useEffect` no cambiaba de dependencias): va con `refreshKey`. *(🆕 3 oct 2026: esa consulta desde el navegador ya no existe —la hace el backend, ver `7b4d89a`— y `refreshKey` se queda sin uso en la tarjeta.)* Si Meta tiene un nombre NUEVO en revisión, la tarjeta dice «Nombre nuevo en revisión por Meta». 🔴 **Eso se lee en `new_name_status`, NUNCA en `name_status`**, que es el estado del nombre actual: PD Cloud da `PENDING_REVIEW` sin ningún cambio pedido, y la primera versión avisó de un nombre nuevo que no existía. Corregido en el commit siguiente. | `index-DwdBFxdA.js` |
| `7f76639` | **Contraste de los botones y las fotos caducadas fuera del chat.** Los botones se pintaban con `bg-muted`/`text-muted-foreground` y en la burbuja saliente —verde, texto oscuro— quedaban **negros sobre verde**. Ahora heredan el color de la burbuja. Y el filtro de caducidad de fotos de `f1d6e8c`, que vivía **solo en la tarjeta de instancia**, pasa a `lib/foto-perfil.ts` y se aplica también en **la lista de chats y la cabecera**, que seguían pidiendo URLs vencidas desde el 17 de agosto. | `index-Cl1Mpyrz.js` |
| `7dc0d76` | **El chat pintaba «Unknown message type».** No tenía casos para `interactiveMessage` ni `templateMessage` (los botones de `sendButtons` y las plantillas de la Cloud API), ni para la **respuesta del usuario al tocar un botón** (`templateButtonReplyMessage`, `buttonsResponseMessage`, `interactiveResponseMessage`): las dos puntas de una conversación con botones. | `index-zAv4gD_K.js` |
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
- 🔴 **Dentro de una burbuja se HEREDA el color**: `text-current`, `border-current/20`, `opacity-70`
  para lo secundario. `bg-muted` y `text-muted-foreground` están pensados para el fondo de la
  aplicación, y en la burbuja saliente (`bg-primary text-primary-foreground`, verde con texto
  oscuro) dejan el contenido **negro sobre verde**. Pasó el 8 sep con los botones y **hubo que
  desplegar dos veces**.
- 🔴 **Un `break` dentro del `switch` de `Chat/messages.tsx` NO vale**: después del `switch` no hay
  nada, así que el componente devolvería `undefined` y **React revienta**. Cada caso nuevo devuelve
  siempre algo, aunque sea un texto de reserva.
- 🔴 **La etiqueta de un botón no es texto: vive dentro de `buttonParamsJson`**, que es una **cadena
  JSON** dentro del propio botón (`{"display_text":"✅ Confirmar","id":"opt_confirm"}`). Se parsea
  con `try/catch`, porque no siempre es JSON válido.
- 🔴 **WhatsApp escribe la negrita con `*asteriscos*`**: si no se convierte, se ven los asteriscos
  tal cual (`*Respuesta rápida*`).
- ⚠️ **El navegador automatizado se congela al abrir un chat grande.** El 8 sep, con 2.140 contactos
  y 1.369 mensajes en la instancia «Proyeccion Digital», dos capturas seguidas fallaron con
  *«renderer may be frozen»*. **No es la aplicación**: en la pantalla de Luis iba. Se comprueba con
  él, no insistiendo.
- 🔴 **El Manager manda el token de la instancia desde el navegador** para preguntarle el perfil a
  Meta. Funciona, pero esa consulta la haría mejor el servidor. 🆕 **Desde `7b4d89a` (3 oct 2026) la
  tarjeta ya no lo hace**: lo pide el backend. ⚠️ **Queda el formulario de CREAR una instancia Cloud
  API** (`NewInstance.tsx`), que consulta Graph con el token que se acaba de escribir.
- 🔴 **Una Cloud API no se vincula con QR**: si sale «Desconectado», el arreglo está en el Business
  Manager de Meta, no en el botón de QR (que para ella no hace nada). Por eso su página no lo ofrece.
- 🔴 **«Visto caído desde» es el primer chequeo que lo vio, no la hora de la caída**: entre dos
  chequeos pasan hasta 30 min, y antes del 3 oct 2026 no había chequeo. La hora exacta, si Meta la
  manda, es la del aviso de cuenta (`PARTNER_REMOVED`) en el historial.
- ⚠️ **Probar el Manager sin producción**: el dashboard se puede levantar con `dist/` servido en local
  y una API falsa que conteste `/instance/fetchInstances` (se hizo así el 3 oct, con Chrome sin
  cabeza y bajo `flock /tmp/claude-1000/qa.lock`); el `localStorage` necesita `apiUrl`, `token`,
  `version` y `provider`, y `i18nextLng=es-ES` para verlo en español.
- ⚠️ **Encender el WebSocket exige `WEBSOCKET_GLOBAL_EVENTS`** —el Manager escucha el canal global, no
  el de la instancia— y el `allowRequest` del backend **admite conexiones sin apikey** según
  `WEBSOCKET_ALLOWED_HOSTS`. Decisión de Luis del 8 sep 2026: **no se enciende**.

## 6. El caso de los botones interactivos (8 sep 2026)

**Lo pidió Luis así:** *«Evolution API nos permite enviar plantillas no oficiales, tipo send button.
Eso sí, son interactivos, en sentido de que genera una respuesta dentro de la conversación, y eso es
lo que yo quiero que se vea ese tipo de plantillas, tanto en Evolution como en Chatwoot, en el canal
de chat, y igualmente la respuesta que genere el usuario.»*

**Eran TRES fallos distintos**, en dos repos, y cada uno callaba a su manera:

| Dónde | Qué se veía | Causa |
|---|---|---|
| Chatwoot, plantilla de Meta | nada, y en el log `no body message found` | `getTypeMessage` no contemplaba `templateMessage` (backend, `31b4c4c5`) |
| Chatwoot, botones | nada, y en el log `Interactive Button Message not mapped` **una vez por botón** | upstream **solo mapeó el PIX brasileño**; el resto caía en un `else` que solo avisaba (backend, `7ec44c20`) |
| Chat del Manager | `Unknown message type: interactiveMessage` y `…: templateButtonReplyMessage` | el `switch` no tenía esos casos (aquí, `7dc0d76`) |

### Cómo llega un mensaje con botones

`POST /message/sendButtons/{instancia}` con los botones de tipo `reply` produce esto:

```json
"interactiveMessage": {
  "body":   { "text": "*Respuesta rápida*\n\nElige una de las opciones:" },
  "footer": { "text": "Proyección Digital" },
  "nativeFlowMessage": {
    "buttons": [
      { "name": "quick_reply", "buttonParamsJson": "{\"display_text\":\"✅ Confirmar\",\"id\":\"opt_confirm\"}" }
    ]
  }
}
```

🔴 **`interactiveMessage` y el `interactiveMessageTemplate` de una plantilla de la Cloud API tienen
la MISMA forma** —header, body, footer y los botones en `nativeFlowMessage`—, por eso el armador de
texto es uno solo, tanto aquí como en el backend.

🔴 **El título va DENTRO de `body.text`, con asteriscos**, no en un `header`: Evolution monta
`*title*\n\n description` al enviar por Baileys.

### La respuesta del usuario

Al tocar un botón llega **`templateButtonReplyMessage`** con `selectedDisplayText` (por Baileys), o
`buttonsResponseMessage`, o un flujo nativo en `interactiveResponseMessage.nativeFlowResponseMessage.paramsJson`
—otra **cadena JSON**—. Se cubren las tres.

### Cómo se probó, y qué se vio

1. `sendButtons` a un número real (el de Luis) por la instancia **de QR**: HTTP **201**.
2. En Chatwoot, consultando la base: el mensaje **con su texto y sus tres botones**.
3. Luis **pulsó «✅ Confirmar»** en el teléfono y la respuesta apareció en las dos pantallas.
4. En el Manager, las burbujas dejaron de decir `Unknown message type`.
5. 🔴 **La primera versión salió ilegible** —botones negros sobre la burbuja verde— y hubo que
   **desplegar otra vez** (`7f76639`). Que el dato llegue **no es que se vea**.

**Bundles:** `index-zAv4gD_K.js` (el render) → `index-Cl1Mpyrz.js` (contraste y fotos).

**El relato completo, con el porqué de cada decisión y lo que pasó con las plantillas de Meta y la
ventana de 24 horas, está en la carpeta de la agencia:**
`Documentacion/INCIDENCIA - Los mensajes fuera de la ventana de 24 h no salen y Evolution los da por enviados (8 sep 2026).md`
(apartados 10 a 12.2).

## 7. El PIX fuera del probador, y dos ejemplos de cobro que sí sirven aquí (8 sep 2026)

El modal «Probar mensajes interactivos» (`src/components/test-interactive-modal.tsx`) traía una
pestaña **PIX** copiada del ejemplo de upstream. Luis: *«en LATAM no se usa PIX ni se conoce… vamos a
agregar dos plantillas de ejemplo allí, una de Binance Pay y otra de Pago Móvil»*.

🔴 **El PIX no se podía adaptar, y por eso se quitó en vez de renombrarse:** es **WhatsApp Pay
Brasil**, la tarjeta la dibuja el teléfono, sus llaves son brasileñas (`cpf`, `cnpj`, EVP…) y **no
admite logo** — el bloque del PIX en `buttonMessage()` de Evolution hace `return` antes de la sección
del encabezado. Un cobro aquí se arma con **`copy` + `url` y su `thumbnailUrl`**, que es lo que hacen
las dos pestañas nuevas.

**El logo vive en el propio Manager**, no en un enlace de fuera:

```
public/assets/images/pagos/binance-pay.png
  → https://evolution.proyecciondigital.org/manager/assets/images/pagos/binance-pay.png
```

🔴 **Tiene que ser una URL pública**, porque quien la descarga es **el servidor de Evolution**, no el
navegador: un archivo local o una ruta relativa no valen. Alojarlo aquí es lo que garantiza que el
ejemplo siga vivo — y da el molde para el logo de cualquier banco.

### 7.1 🔴 Y no se puede tener icono Y textos propios: hay que elegir

Lo pidió Luis viéndolo: *«ahí quiero poner el logo o icono de Binance Pay… no hace falta indicar
"EVP:", es mejor "ID:", y el botón que diga "Copiar Binance ID"»*. **Las dos cosas a la vez no
existen**, y conviene tenerlo escrito con los campos delante:

| | Con `payment_info` (la del PIX) | Con `copy` (botones) |
| :--- | :--- | :--- |
| Icono a la izquierda | 🟢 Sí — **pero es el de PIX, fijo** | 🔴 No hay |
| Título | 🟢 `merchant_name` | 🟢 `title` |
| La línea de datos | 🟡 **`key_type` + `key`** → sale `EVP: 123…` | 🟢 `description`, lo escribes tú |
| Texto del botón | 🔴 **«Copiar clave Pix»**, de WhatsApp | 🟢 `displayText`, lo escribes tú |
| Imagen propia | 🔴 No admite | 🟡 Sí, pero **al ancho del mensaje** |

**La tarjeta del PIX la dibuja el cliente de WhatsApp con tres datos**, y ni el icono ni el rótulo del
botón son campos del mensaje: no hay configuración que llegue ahí. Por eso las pestañas de Binance
Pay y Pago Móvil usan **`copy`**: se pierde el icono y se gana escribir «ID:» y «Copiar Binance ID»,
que era lo que se pidió. El rombo del título (`◆`) es un emoji, lo único que se le parece.

### 7.2 Cómo quedaron las dos, después de probarlo todo (8 sep 2026)

Se intentó reproducir la tarjeta del PIX con los datos de Binance —es lo que se quería— y se
descartó al medirlo: **el icono y el rótulo «Copiar clave Pix» no son campos del mensaje** y el
`key_type` tampoco es texto libre (con `"ID"` WhatsApp pinta «Teléfono»). Decisión de Luis: *«esa
plantilla de PIX no nos va a servir, mejor olvidarla, dejarla ahí de ejemplo para saber que existe»*.
El detalle de las cinco pruebas está en el `DESPLIEGUE-PD.md` **del backend**, § 7.2.

**Las dos pestañas de cobro son imagen + texto + botón de copiar**, que da control total del texto:

| | Binance Pay | Pago Móvil |
| :--- | :--- | :--- |
| Imagen | `pagos/binance-pay.png` | `pagos/pago-movil.png` |
| Primera línea | `Método de pago: *Binance Pay*` | `Método de pago - *Pago Móvil*` |
| Datos | `ID de Binance: …` | `Banco`, `Cédula`, `Teléfono` |
| Instrucción | «Paga a este ID y envíanos captura…» | «Haz el pago y envíanos el capture…» |
| Pie | «Tu cita queda confirmada al recibir el comprobante» | igual |
| Botones | Copiar Binance ID | Copiar cédula · Copiar teléfono |

🔴 **Lo que se VE y lo que se COPIA son distintos, a propósito.** En pantalla van con su formato
legible —`Cédula: V-25697719`, `Teléfono: 0424-544-1315`— y el `copyCode` va **limpio**
—`25697719`, `04245441315`—, porque es lo que se pega en la app del banco. Por eso `copyCode` no es
igual al texto: no es un descuido.

🔴 **Sin título (`title`)**, a propósito: el texto ya empieza por su propia línea en negrita. Eso
destapó un fallo de upstream —`*${data.title}*` sin comprobar que existiera, que llegaba como
**undefined**— corregido en el backend.

**Los dos logos son apaisados (1000×250)**, no cuadrados: WhatsApp estira la imagen de cabecera al
ancho del mensaje y un logo 1:1 se come media pantalla. El de Pago Móvil **se dibujó aquí** (un
teléfono y el rótulo, sin marca de ningún banco), porque se pidió genérico.

🔴 **Un `thumbnailUrl` que da 404 hace fallar el envío entero**: el archivo va antes que la plantilla
que lo usa.

🔴 **Al añadir una pestaña hay que tocar los CUATRO idiomas** (`src/translate/languages/*.json`,
clave `testInteractive.tabs`). Una clave que falta no rompe nada: pinta el identificador crudo.

### 7.3 Por qué estas dos plantillas son así y no otra cosa

Se investigó hasta el final si se podía tener una tarjeta nativa propia, tipo PIX, con el logo de
Binance. **No se puede**, y la razón no es de código: los pagos nativos de WhatsApp están habilitados
**por país** —India, Brasil, México e Indonesia— y dentro de cada uno los operan **proveedores de
pago externos** integrados con Meta (Solution Partner). **RD y Venezuela no están, y la agencia no es
un método de pago**, así que la vía existe pero no nos toca (decisión de Luis, 8 sep 2026).

**Por eso lo adoptado es imagen + texto + botones de copiar**, que es lo que hay aquí.
❌ **Y NO se propone dibujar la tarjeta entera como imagen** (logo y datos dentro del PNG): Luis lo
descartó expresamente.

El relato completo, con fuentes y con lo que sí queda disponible (**WhatsApp Flows**), está en
`Documentacion/INCIDENCIA - Los mensajes fuera de la ventana de 24 h no salen y Evolution los da por
enviados (8 sep 2026).md`, apartado 16, de la carpeta de la agencia.

## 8. Las imágenes de catálogo (9 sep 2026)

`public/assets/images/catalogo/` → se sirven en
`https://evolution.proyecciondigital.org/manager/assets/images/catalogo/…`

Son las piezas del **carrusel de WhatsApp** de Zenithe (diente completo y brackets). Viven aquí por
la misma razón que los logos de pago: **quien descarga esa URL es el SERVIDOR de Evolution**, no el
navegador, así que tiene que ser pública y estable.

🔴 **Van apaisadas (1200×628)**, no en el 4:5 de los creativos de Meta Ads: el carrusel recorta al
centro y se lleva el titular y el precio. El porqué y cómo se componen, en
`Documentacion/APRENDIZAJE - El carrusel de WhatsApp: por que el creativo del feed no sirve y como se compone (9 sep 2026).md`
de la carpeta de la agencia.

⚠️ **Son de PRUEBA**: se compusieron a mano a partir de los creativos, no salen de un lote de Panel
Ads. Si el catálogo pasa a producción, lo limpio es crear un lote propio de piezas apaisadas.
