// Singleton compartido del vault de identidad id.closer.click.
// Lo usan la firma de pronósticos (share.ts) y el panel de perfil/contactos/
// rankings (IdentityPanel). Conecta una sola vez vía iframe + postMessage.

import { Identity } from '@gatoseya/closer-click-identity'

export type IdentityInstance = InstanceType<typeof Identity>

let _idPromise: Promise<IdentityInstance | null> | null = null

/** Conecta (una sola vez) al vault de identidad. Devuelve null si no alcanza. */
export function getIdentity (): Promise<IdentityInstance | null> {
  if (!_idPromise) {
    _idPromise = Identity.connect()
      .then((id) => id)
      .catch((e) => { console.warn('Identity vault inalcanzable:', e); return null })
  }
  return _idPromise
}
