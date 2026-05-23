import { test, expect, chromium } from '@playwright/test'

// Salas: round-trip de los enlaces (invitación + contribución) y, lo más
// importante, la SINCRONIZACIÓN EN VIVO entre DOS navegadores contra el proxy
// real del ecosistema (canales firmados). Como firmar requiere el vault de
// identidad (no fiable headless), inyectamos un "vault de prueba" con una clave
// ECDSA P-256 generada en el navegador (mismo canonicalStringify que el proxy).

const BASE = process.env.E2E_BASE || 'https://localhost:5180'

test('los enlaces de sala (invitación y contribución) hacen round-trip', async ({ page }) => {
  await page.goto(BASE + '/')

  const r = await page.evaluate(async () => {
    const room = await import('/src/lib/room.ts')
    const share = await import('/src/lib/share.ts')

    // Firmamos el descriptor con una clave de prueba, replicando signBlob.
    const subtle = globalThis.crypto.subtle
    const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const jwk = await subtle.exportKey('jwk', kp.privateKey) as JsonWebKey
    const b64urlToBytes = (s: string): Uint8Array => {
      const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
      const o = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i)
      return o
    }
    const b64url = (bytes: Uint8Array): string => {
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const desc = JSON.stringify({ i: 'room-123', n: 'Sala de prueba', m: 'score', s: 0, c: 1700000000000 })
    const sig = new Uint8Array(await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
      new TextEncoder().encode(JSON.stringify(desc)),
    ))
    const x = b64urlToBytes(jwk.x as string)
    const y = b64urlToBytes(jwk.y as string)
    const prefix = (y[31]! & 1) === 1 ? 0x03 : 0x02
    const db = new TextEncoder().encode(desc)
    const parts = [
      Uint8Array.of(2), sig, Uint8Array.of(prefix), x,
      Uint8Array.of((db.length >> 8) & 255, db.length & 255), db,
    ]
    const total = parts.reduce((s, p) => s + p.length, 0)
    const blob = new Uint8Array(total)
    let off = 0
    for (const p of parts) { blob.set(p, off); off += p.length }
    const inviteFrag = 'room=' + b64url(blob)

    const invite = await room.parseRoomInvite(inviteFrag)

    // Contribución: un fragmento de pronóstico cualquiera, asociado a la sala.
    const contribUrl = room.buildMemberContribUrl('room-123', 'FRAGFIRMADO__')
    const contribFrag = contribUrl.slice(contribUrl.indexOf('#') + 1)
    const contrib = room.parseMemberContrib(contribFrag)

    return {
      kindInvite: room.fragKind(inviteFrag),
      kindMember: room.fragKind(contribFrag),
      inviteId: invite?.id,
      inviteName: invite?.name,
      inviteMode: invite?.mode,
      inviteVerified: invite?.verified,
      contribRoomId: contrib?.roomId,
      contribFragInner: contrib?.frag,
      hasShareBase: typeof share.SHARE_BASE === 'string',
    }
  })

  expect(r.kindInvite).toBe('room')
  expect(r.kindMember).toBe('member')
  expect(r.inviteId).toBe('room-123')
  expect(r.inviteName).toBe('Sala de prueba')
  expect(r.inviteMode).toBe('score')
  expect(r.inviteVerified).toBe(true)
  expect(r.contribRoomId).toBe('room-123')
  expect(r.contribFragInner).toBe('FRAGFIRMADO__')
  expect(r.hasShareBase).toBe(true)
})

test('dos navegadores sincronizan un pronóstico en una sala vía el proxy', async () => {
  test.setTimeout(60000)

  // Script que corre en cada navegador: arma un RoomSync (sobre el cliente
  // estándar del ecosistema) y difunde su frag; debe recibir el del otro peer.
  // El canal del proxy lo firma el propio proxy-client (clave de transporte),
  // así que no hace falta inyectar identidad para este intercambio.
  const driver = async (args: { roomId: string; myFrag: string; waitForFrag: string }) => {
    const { roomId, myFrag, waitForFrag } = args
    const { RoomSync } = await import('/src/lib/roomSync.ts')
    return await new Promise<{ received: boolean }>((resolve) => {
      let done = false
      const sync = new RoomSync(roomId, myFrag, {
        onPrediction: (frag: string) => {
          if (frag === waitForFrag && !done) {
            done = true
            try { sync.stop() } catch { /* */ }
            resolve({ received: true })
          }
        },
      })
      sync.start()
      setTimeout(() => { if (!done) { try { sync.stop() } catch { /* */ } resolve({ received: false }) } }, 25000)
    })
  }

  const roomId = 'e2e-' + Math.random().toString(36).slice(2, 10)
  const fragA = 'PREDICCION_A_' + roomId
  const fragB = 'PREDICCION_B_' + roomId

  const browserA = await chromium.launch()
  const browserB = await chromium.launch()
  try {
    const pageA = await (await browserA.newContext({ ignoreHTTPSErrors: true })).newPage()
    const pageB = await (await browserB.newContext({ ignoreHTTPSErrors: true })).newPage()
    await pageA.goto(BASE + '/')
    await pageB.goto(BASE + '/')

    // Ambos arrancan a la vez; cada uno espera el frag del otro.
    const [resA, resB] = await Promise.all([
      pageA.evaluate(driver, { roomId, myFrag: fragA, waitForFrag: fragB })
        .catch(() => ({ received: false })),
      pageB.evaluate(driver, { roomId, myFrag: fragB, waitForFrag: fragA })
        .catch(() => ({ received: false })),
    ])

    expect(resA.received, 'A recibió el pronóstico de B').toBe(true)
    expect(resB.received, 'B recibió el pronóstico de A').toBe(true)
  } finally {
    await browserA.close()
    await browserB.close()
  }
})
