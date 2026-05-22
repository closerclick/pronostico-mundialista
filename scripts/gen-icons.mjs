import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'images', 'logo.png')
const outDir = resolve(root, 'public', 'icons')

await mkdir(outDir, { recursive: true })

const sizes = [192, 512]
for (const size of sizes) {
  await sharp(src).resize(size, size).png().toFile(resolve(outDir, `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

// Maskable: padding interior para safe zone (~80% del lienzo)
await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }
})
  .composite([{ input: await sharp(src).resize(410, 410).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(resolve(outDir, 'icon-maskable-512.png'))
console.log('✓ icon-maskable-512.png')
