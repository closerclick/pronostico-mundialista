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
identidad y compartirlos por QR / redes / PDF. Tema visual "estadio nocturno"
(azul) con tipografía Anton + Hanken Grotesk. Diseño responsive (móvil y
escritorio con barra lateral fija).

### Fase de grupos
- 12 grupos (A–L) con banderas; **arrastra** cada equipo a su posición (1º–4º).
- 1º y 2º clasifican directo; el bloque **Mejores terceros** lista los 12
  terceros para ordenarlos: los **8 de arriba** clasifican a dieciseisavos.

### Llaves
- Formato **simétrico** (mitades izquierda/derecha hacia la final central con
  trofeo). Cada cupo muestra **bandera + código de país** (los vacíos, su
  etiqueta: `1.º A`, `Gan. 89`, …).
- Dieciseisavos se llenan con los clasificados de grupos; las rondas siguientes
  arrancan **vacías** y se llenan al tocar quién avanza (tocar de nuevo vacía).
  Se puede elegir ganador **aunque el rival aún esté vacío**.
- Al cambiar la fase de grupos, los picks afectados se **invalidan en cascada**.
- Numeración oficial (dieciseisavos 73–88 … final 104) + partido por el 3.º.

### Multi-pronóstico + identidad
- Barra lateral con **mis pronósticos** (editables) e **importados** (de otras
  personas, solo lectura). Crear, renombrar, eliminar, duplicar.
- **Mi identidad** (vault `id.closer.click` vía `@gatoseya/closer-click-identity`):
  perfil (apodo que firma), **contactos** (se agregan por **token** corto del
  proxy, resuelto con un challenge/response firmado) y **rankings** (reputación
  web-of-trust, valoración por estrellas).

### Compartir / exportar
- El pronóstico completo se codifica en una cadena **base64url** (permutaciones
  de grupos + ranking de terceros + 2 bits por llave, empaquetados a bit).
- Se **firma con ECDSA P-256** y se arma `https://mundial.closer.click/#<payload>`
  mostrado como **QR**. Al abrir un enlace, la app **verifica la firma** y
  muestra al autor (que puedes agregar a contactos / valorar).
- Botones de **redes** (WhatsApp, Telegram, X, Facebook, Instagram vía Web Share API).
- **Imprimir** y **Descargar PDF** (una sola hoja **A4 vertical**: grupos +
  llaves + QR firmado, vía `html2canvas` + `jspdf`).

### PWA
- Instalable; iconos y favicon generados desde `images/logo.svg`
  (`scripts/gen-icons.mjs`, corre en cada build).
- **En desarrollo** el service worker es `selfDestroying` (sin caché: siempre
  contenido fresco). Para producción, quitar `selfDestroying` en `vite.config.ts`
  para reactivar la instalación de la PWA.

## Estructura

```
images/logo.svg          fuente única de iconos/favicon del PWA
scripts/gen-icons.mjs     genera icons + favicon desde el SVG
src/
├── lib/
│   ├── teams.ts        48 equipos (grupos A–L, bandera, código FIFA, id estable)
│   ├── bracket.ts      estructura R32→final + asignación de mejores terceros
│   ├── prediction.ts   estado, resolución por partido, prune en cascada
│   ├── codec.ts        encode/decode compacto (Lehmer + bits + base64url)
│   ├── identity.ts     singleton del vault id.closer.click
│   ├── share.ts        firma/verificación ECDSA y enlace de compartir
│   ├── proxy.ts        resolver token→identidad (challenge firmado por el proxy)
│   ├── rating.ts       reputación derivada (web-of-trust)
│   └── store.ts        librería de pronósticos en localStorage
├── components/
│   ├── GroupCard.vue / ThirdsBlock.vue   grupos + terceros arrastrables
│   ├── BracketTab.vue / MatchBox.vue     llaves simétricas clicables
│   ├── Sidebar.vue        librería de pronósticos + acciones
│   ├── ShareModal.vue     QR + redes + imprimir/PDF
│   ├── IdentityPanel.vue  perfil / contactos / rankings
│   └── PrintView.vue      hoja imprimible/PDF A4 portrait
└── App.vue              cabecera, pestañas, carga desde #hash, impresión/PDF
```

> Nota: la asignación de los 8 mejores terceros usa un emparejamiento
> determinista que respeta los grupos permitidos por cada cruce. Aproxima el
> anexo oficial de la FIFA (la combinación de 8 grupos determina los cruces).

## Build

```bash
./build.sh         # instala deps si falta y compila a dist/
# o: npm install && npm run build
npm run dev        # desarrollo
npm run typecheck  # vue-tsc
```

Deploy a GitHub Pages (dominio `mundial.closer.click`) vía GitHub Actions en
cada push a `main` (`.github/workflows/deploy.yml`).

## Estado

✅ Funcional. Datos del sorteo final 2026 cargados.
