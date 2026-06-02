// Puente al registro de reputación compartido (reputation.closer.click).
// Reusa el web-of-trust local del vault para ponderar (anti-sybil). En el
// pronosticador: mostrar la reputación de los rivales en el leaderboard.

import { createVaultReputation } from '@closerclick/closer-click-reputation'
import { getIdentity } from './identity'

let _rep: ReturnType<typeof createVaultReputation> | null = null

export async function getReputation () {
  if (_rep) return _rep
  const id = await getIdentity()
  if (!id) return null
  _rep = createVaultReputation(id as any)
  return _rep
}
