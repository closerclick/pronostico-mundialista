import { test, expect, type Page } from '@playwright/test'

// Smoke tests de UI. No dependen de firmar/compartir/QR/identidad (usan el vault
// id.closer.click por red; no fiable headless), ni de PDF.

// En un arranque limpio el único pronóstico es el "oficial" (solo lectura, modo
// marcador), que oculta la barra de modo y abre en "Resultados". Creamos uno
// propio editable para los smoke tests.
async function createOwnPrediction (page: Page): Promise<void> {
  await page.goto('/')
  // El botón de menú solo se ve en viewport angosto; en desktop el cajón está
  // siempre visible. Abrimos el menú si hace falta y creamos un pronóstico.
  const menu = page.getByTestId('menu-btn')
  if (await menu.isVisible()) await menu.click()
  await page.getByTestId('sb-new').click()
  await expect(page.getByTestId('tab-grupos')).toHaveClass(/active/)
}

test('la app carga y muestra las pestañas Grupos y Llaves', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('tab-grupos')).toBeVisible()
  await expect(page.getByTestId('tab-llaves')).toBeVisible()
})

test('cambiar a modo Medio/Completo muestra Resultados; Simple la oculta', async ({ page }) => {
  await createOwnPrediction(page)
  await expect(page.getByTestId('mode-bar')).toBeVisible()

  // En modo Simple (manual, por defecto) la pestaña Resultados no existe.
  await expect(page.getByTestId('tab-resultados')).toHaveCount(0)

  // Medio (winlose) -> aparece Resultados.
  await page.getByTestId('mode-winlose').click()
  await expect(page.getByTestId('tab-resultados')).toBeVisible()

  // Completo (score) -> sigue visible.
  await page.getByTestId('mode-score').click()
  await expect(page.getByTestId('tab-resultados')).toBeVisible()

  // Volver a Simple (manual) -> se oculta.
  await page.getByTestId('mode-manual').click()
  await expect(page.getByTestId('tab-resultados')).toHaveCount(0)
})

test('cambiar de pestaña funciona', async ({ page }) => {
  await createOwnPrediction(page)

  await expect(page.getByTestId('zone-grupos')).toBeVisible()

  await page.getByTestId('tab-llaves').click()
  await expect(page.getByTestId('zone-llaves')).toBeVisible()
  await expect(page.getByTestId('zone-grupos')).not.toBeVisible()

  await page.getByTestId('tab-grupos').click()
  await expect(page.getByTestId('zone-grupos')).toBeVisible()
})
