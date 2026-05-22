// Firma del pronóstico con la identidad ECDSA P-256 del vault id.closer.click
// y armado del enlace/QR de compartir hacia mundial.closer.click.

import { getIdentity } from './identity'

export { getIdentity }

export const SHARE_BASE = 'https://mundial.closer.click/'

// Payload que viaja en el fragmento (#) del enlace. Claves cortas para que el
// QR sea lo más pequeño posible:
//   c: código compacto del pronóstico
//   s: firma ECDSA (base64) sobre JSON.stringify(c)
//   x,y: coordenadas de la clave pública P-256 (base64url, como en el JWK)
//   n: apodo del autor (opcional)
export interface SharePayload {
  c: string
  s: string
  x: string
  y: string
  n?: string
}

// El vault firma canonicalStringify(data); para un string eso es
// JSON.stringify(string). Lo replicamos para verificar.
function canonicalBytes (code: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(code))
}

function b64ToBytes (b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64url (bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToString (s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(b64)
}

/**
 * Firma el código del pronóstico y arma el enlace compartible.
 * Lanza si no hay identidad disponible.
 */
export async function buildShareUrl (code: string): Promise<{ url: string; publickey: string; nickname?: string }> {
  const id = await getIdentity()
  if (!id) throw new Error('No se pudo conectar a la identidad (id.closer.click).')

  const { signature, publickey } = await id.signData(code)
  const jwk = JSON.parse(publickey) as { x: string; y: string }
  const nickname = id.me?.nickname

  const payload: SharePayload = { c: code, s: signature, x: jwk.x, y: jwk.y }
  if (nickname) payload.n = nickname

  const frag = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)))
  return { url: `${SHARE_BASE}#${frag}`, publickey, nickname }
}

export interface IncomingPrediction {
  code: string
  verified: boolean
  nickname?: string
  /** clave pública JWK (string) reconstruida, identifica al autor */
  publickey: string
}

/** Lee y verifica un pronóstico desde el fragmento del enlace (sin el #). */
export async function parseShareFragment (frag: string): Promise<IncomingPrediction | null> {
  let payload: SharePayload
  try {
    payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(b64urlToString(frag), (c) => c.charCodeAt(0)),
    ))
  } catch { return null }
  if (!payload?.c || !payload?.s || !payload?.x || !payload?.y) return null

  const jwk = { kty: 'EC', crv: 'P-256', x: payload.x, y: payload.y, ext: true }
  let verified = false
  try {
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    )
    verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      b64ToBytes(payload.s) as BufferSource,
      canonicalBytes(payload.c) as BufferSource,
    )
  } catch (e) {
    console.warn('Verificación de firma falló:', e)
  }

  return {
    code: payload.c,
    verified,
    nickname: payload.n,
    publickey: JSON.stringify(jwk),
  }
}
