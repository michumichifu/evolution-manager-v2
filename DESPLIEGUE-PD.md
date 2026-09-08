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
  Meta. Funciona, pero esa consulta la haría mejor el servidor.
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

⚠️ **La pestaña de Pago Móvil va sin `thumbnailUrl` todavía**, a la espera de su logo. **Se pone
cuando exista el archivo, no antes**: un `thumbnailUrl` que da 404 hace fallar el envío entero.

🔴 **Al añadir una pestaña hay que tocar los CUATRO idiomas** (`src/translate/languages/*.json`,
clave `testInteractive.tabs`). Una clave que falta no rompe nada: pinta el identificador crudo.
