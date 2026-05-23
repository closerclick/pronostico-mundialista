# Changelog

Registro de cambios desplegados de **Pronóstico Mundialista**
(`mundial.closer.click`). Formato basado en [Keep a Changelog](https://keepachangelog.com/es/).

## 2026-05-23

### Agregado — Sellado de fecha (autoridad de tiempo)
- **Sello de tiempo** de los pronósticos vía **`signer.closer.click`** (nueva
  herramienta del ecosistema, repo `closer-click-signer`). El sellador firma
  `{ hash, ts }` con su clave → prueba **cuándo** existió el pronóstico sin verlo.
  El sello se pide al compartir/aportar y viaja dentro del blob firmado (payload
  v2). La UI marca cada aporte de sala: 🕓 *a tiempo* / ⚠ *tarde o inválido* /
  — *sin fecha*, contra el inicio del torneo. Best-effort (con timeout).

### Agregado — Sincronización de salas robusta (P2P)
- **Sobres firmados con `ts` del autor**: cada aporte va firmado por el vault del
  autor; el `ts` ordena versiones (last-write-wins).
- **Gossip**: cada peer reenvía todos los sobres que conoce (seguro: van
  firmados), así la sala converge sin que cada autor esté online.
- **Entrega offline**: los aportes se difunden por `sendByPubkey` (cola 24 h del
  proxy) y un buzón global los aplica aunque no tengas la sala abierta.
- **Borrar mi aporte = tombstone firmado**: solo el autor puede borrarlo; no se
  "revive" por un reenvío viejo. Lápidas ocultas en la UI.

### Agregado — Compartir y UI
- **Modal de compartir sala** (QR + enlace + redes + compartir nativo), abierto
  desde el botón de compartir del header y de la barra lateral.
- Botones de **compartir** en header y barra lateral de salas; fila de **redes
  sociales** reutilizable (WhatsApp/Telegram/X/Facebook/nativo).
- **Nickname requerido** para aportar a una sala (igual que para compartir).

### Cambiado
- Botones de acción **táctiles más grandes** en mobile (header y barra lateral);
  en la barra lateral mantienen dos columnas y los íconos envuelven en varias
  filas sin empujar el nombre. En escritorio quedan igual.
- Header de sala: acciones a la derecha, **"volver"** al borde.
- Títulos de los **tabs principales** 20 % más chicos.
- "Clonar a otro tipo" → **"Clonar pronóstico"**.

### Corregido
- `requestSeal` ahora tiene timeout: un sellador caído ya no bloquea el compartir.
- `➕` duplicado en el botón "Crear sala".

### Tests
- e2e de salas con **vault de prueba** inyectado y **dos navegadores** contra el
  proxy real (aportar → gossip → borrar), con screenshots.
