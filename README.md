# Pronóstico Mundialista

Aplicación de pronósticos del Mundial del ecosistema [Closer Click](https://seyacat.github.io/closerclick/): predice resultados de los partidos, compite con tus amigos y lleva tu tabla de aciertos. Como toda app del ecosistema, corre del lado del cliente y tú controlas tu información.

## Filosofía

El eje del ecosistema **[CloserClick](https://closer.click)** es el **autohosteo** y el **control sobre la propia información**: qué comparto, cómo lo comparto y cuándo lo comparto.

### Manifiesto

> **Tu información, en tu servidor, bajo tus reglas.**
> CloserClick nace de una idea simple: lo que es tuyo, se queda contigo. Tú decides **qué** compartes, **cómo** lo compartes y **cuándo** lo compartes. Sin intermediarios, sin nubes ajenas, sin letra pequeña.
>
> Cada aplicación del ecosistema CloserClick vive donde tú quieras: tu propio servidor, tu propia infraestructura. Tus datos no viajan a empresas que los monetizan. Tú eres el dueño y el administrador. Compartes solo lo que eliges, con quien eliges, durante el tiempo que eliges.

### Tres pilares

> - **Qué comparto:** solo la información que decido exponer, nada más.
> - **Cómo lo comparto:** con el formato, el acceso y las condiciones que yo defino.
> - **Cuándo lo comparto:** en el momento que quiero, y lo retiro cuando quiero.
>
> Todo sobre infraestructura que tú controlas. Eso es autohosteo. Eso es soberanía digital.

---

## Qué hace

App cliente (Vue 3 + Vite + TS, PWA) para armar **varios** pronósticos del
**Mundial 2026** (48 selecciones, sorteo final del 5 dic 2025), firmarlos con tu
identidad y compartirlos por QR / redes / PDF. Bilingüe **ES/EN**, tema visual
"estadio nocturno" (azul, tipografías Anton + Hanken Grotesk), responsive (móvil
y escritorio con barra lateral fija).

### Tres modos de juego (por pronóstico)
- **Simple** — ordenás a mano la tabla de cada grupo (arrastrar) y el ranking de
  los 12 terceros (los 8 mejores clasifican). No se cargan resultados.
- **Medio** — marcás **gana/empata/pierde** de cada partido de grupo; las
  posiciones se **calculan** (puntos → enfrentamiento directo → orden de sorteo).
- **Completo** — cargás el **marcador** (goles) de cada partido; las posiciones
  se calculan con diferencia de gol y goles a favor.

En Medio/Completo aparece la pestaña **Resultados** (carga de partidos) y la
pestaña Grupos muestra la tabla calculada (solo lectura). Un botón **Confirmar
cambios** aplica las posiciones a las llaves (invalidando en cascada los picks
afectados); en Simple, confirmar aparece cuando el reordenado afecta las llaves.

### Llaves
- Formato **simétrico** con la final al centro y trofeo, y **líneas conectoras**
  que unen cada partido con la ronda siguiente. Cada cupo muestra bandera +
  **código de país**; los vacíos, su etiqueta (`1.º A`, `Gan. 89`, …).
- Dieciseisavos se llenan con los clasificados; las rondas siguientes se llenan
  al elegir quién avanza (se puede elegir aunque el rival esté vacío).
- En Medio/Completo, un cupo solo se completa cuando la posición ya es **segura**
  según lo cargado; si no, queda en placeholder (no se "adivina").

### Resultados oficiales y puntuación
- En la barra lateral hay una entrada especial **"Resultados"** (los oficiales
  del torneo): **no es un pronóstico**, solo se cargan los marcadores; las
  posiciones y llaves se derivan solas. Utilidades: **Aleatorio**, **Borrar
  todos**, **Obtener oficial** (simulado hasta que empiece el Mundial).
- En eliminatorias el que avanza lo decide el **marcador**; si hay empate,
  aparecen casilleros de **penales**.
- Cada pronóstico se **puntúa** contra los resultados oficiales (chip de puntos
  en la barra lateral). Solo cuenta lo **cierto**: posiciones aseguradas (+3 c/u),
  aciertos de llaves por ronda (R32 +4 … final/campeón +20, 3.º +5), acierto
  1/–/2 por partido (+1, Medio y Completo) y marcador exacto (+2, solo Completo).
  El panel **"¿Cómo se puntúa?"** lo explica con pestañas por modo.

### Multi-pronóstico + identidad
- **Mis pronósticos** (editables), **Pronósticos amigos** (importados, solo
  lectura) y **Resultados** (oficiales). Crear, renombrar, eliminar, duplicar.
- **Mi identidad** (vault `id.closer.click` vía `@gatoseya/closer-click-identity`):
  perfil (apodo que firma), **contactos** por **token** corto del proxy (resuelto
  con challenge/response firmado) y **rankings** (web-of-trust, estrellas).

### Compartir / exportar
- El pronóstico se codifica COMPLETO en una cadena **base64url** (codec v3:
  modo + posiciones + ranking de terceros + ganadores de llaves + resultados con
  goles y penales) — todo lo necesario para **reconstruirlo desde el link**.
- Se **firma con ECDSA P-256**, se arma `https://mundial.closer.click/#<payload>`
  y se muestra como **QR**. Al importar/abrir un enlace se **verifica la firma**.
- Botones de **redes** (WhatsApp, Telegram, X, Facebook, Instagram/Web Share API).
- **Imprimir** y **Descargar PDF** en una hoja **A4** (plantilla distinta por
  modo) con el QR firmado, vía `html2canvas` + `jspdf`.

### PWA
- Instalable; iconos y favicon generados desde `images/logo.svg`
  (`scripts/gen-icons.mjs`, corre en cada build).
- **En desarrollo** el service worker es `selfDestroying` (sin caché). Para
  producción, quitar `selfDestroying` en `vite.config.ts` para reactivar la PWA.

## Estructura

```
images/logo.svg           fuente única de iconos/favicon del PWA
scripts/gen-icons.mjs     genera icons + favicon desde el SVG
src/
├── i18n.ts             vue-i18n (ES/EN) + selector de idioma
├── lib/
│   ├── teams.ts        48 equipos (grupos A–L, bandera, código FIFA, id estable)
│   ├── bracket.ts      estructura R32→final + asignación de mejores terceros
│   ├── standings.ts    cálculo de tabla por resultados + posiciones "seguras"
│   ├── prediction.ts   estado, resolución por partido (certeza), prune en cascada
│   ├── codec.ts        encode/decode compacto v3 (Lehmer + bits + base64url)
│   ├── scoring.ts      puntuación de un pronóstico vs resultados oficiales
│   ├── identity.ts     singleton del vault id.closer.click
│   ├── share.ts        firma/verificación ECDSA y enlace de compartir
│   ├── proxy.ts        resolver token→identidad (challenge firmado por el proxy)
│   ├── rating.ts       reputación derivada (web-of-trust)
│   └── store.ts        librería de pronósticos en localStorage
├── components/
│   ├── GroupCard.vue / ThirdsBlock.vue   grupos + terceros arrastrables (Simple)
│   ├── StandingsTable.vue                 tabla calculada (Medio/Completo)
│   ├── ResultsTab.vue                     carga de resultados (grupos + llaves)
│   ├── BracketTab.vue / MatchBox.vue      llaves simétricas con conectores
│   ├── Sidebar.vue        librería + acciones + puntajes
│   ├── ShareModal.vue     QR + redes + imprimir/PDF
│   ├── ScoringInfo.vue    panel "¿Cómo se puntúa?" (pestañas por modo)
│   ├── IdentityPanel.vue  perfil / contactos / rankings
│   └── PrintView.vue      hoja imprimible/PDF A4 (plantilla por modo)
└── App.vue              cabecera, modos, pestañas, carga desde #hash, impresión
```

> Nota: la asignación de los 8 mejores terceros usa un emparejamiento
> determinista que respeta los grupos permitidos por cada cruce. Aproxima el
> anexo oficial de la FIFA (la combinación de 8 grupos determina los cruces).

## Build y tests

```bash
./build.sh         # instala deps si falta y compila a dist/
npm run dev        # desarrollo (http://localhost:5173)
npm run typecheck  # vue-tsc
npm run lint:fix   # eslint
npm run test:e2e   # Playwright (incluye round-trip "reconstruir desde el link")
```

Deploy a GitHub Pages (dominio `mundial.closer.click`) vía GitHub Actions en
cada push a `main` (`.github/workflows/deploy.yml`).

## Estado

✅ Funcional. Datos del sorteo final 2026 cargados.
