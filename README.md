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

App cliente (Vue 3 + Vite + TS, PWA instalable) para armar tu pronóstico del
**Mundial 2026** (48 selecciones, sorteo final del 5 dic 2025) y compartirlo
**firmado** por QR.

### Fase de grupos
- 12 grupos (A–L) con banderas; **arrastra** cada equipo a su posición (1º–4º).
- 1º y 2º clasifican directo; el bloque **Mejores terceros** lista los 12
  terceros para ordenarlos: los **8 de arriba** clasifican a dieciseisavos.

### Llaves
- Se arman solas a partir de la fase de grupos (incluida la asignación de los 8
  mejores terceros a sus cruces, respetando los grupos permitidos por posición
  de bombo). Toca el equipo que avanza ronda a ronda hasta el **campeón**.
- Numeración oficial de partidos (dieciseisavos 73–88 … final 104) y partido por
  el tercer puesto.

### Compartir
- Todo el pronóstico se codifica en una cadena **base64url de ~22 caracteres**
  (permutaciones de grupos + ranking de terceros + ganadores de cada llave,
  empaquetados a nivel de bits).
- Se **firma con tu identidad ECDSA P-256** del vault `id.closer.click`
  (vía `@gatoseya/closer-click-identity`) y se arma un enlace
  `https://mundial.closer.click/#<payload>` que se muestra como **QR**.
- Al abrir un enlace compartido, la app **verifica la firma** (Web Crypto) y
  muestra al autor; puedes “usar como base” para editarlo.

## Estructura

```
src/
├── lib/
│   ├── teams.ts        48 equipos (12 grupos A–L, banderas) con id global estable
│   ├── bracket.ts      estructura R32→final + asignación de mejores terceros
│   ├── prediction.ts   estado del pronóstico y resolución a equipos por partido
│   ├── codec.ts        encode/decode compacto (Lehmer + bits + base64url)
│   └── share.ts        firma/verificación ECDSA y enlace de compartir
├── components/
│   ├── GroupCard.vue    grupo arrastrable (vuedraggable)
│   ├── ThirdsBlock.vue  ranking de los 12 terceros
│   ├── BracketTab.vue   llaves clicables
│   └── ShareModal.vue   QR + enlace firmado
└── App.vue              pestañas Grupos/Llaves + carga desde #hash
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

## Estado

✅ Funcional. Datos del sorteo final 2026 cargados.
