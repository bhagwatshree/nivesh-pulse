import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../public/icons/', import.meta.url)
const std = readFileSync(new URL('source.svg', root))
const maskable = readFileSync(new URL('source-maskable.svg', root))

const jobs = [
  [std, 192, 'icon-192.png'],
  [std, 512, 'icon-512.png'],
  [std, 180, 'apple-touch-icon.png'],
  [std, 32, 'favicon-32.png'],
  [std, 16, 'favicon-16.png'],
  [maskable, 192, 'icon-192-maskable.png'],
  [maskable, 512, 'icon-512-maskable.png'],
]

for (const [buf, size, name] of jobs) {
  await sharp(buf, { density: 384 }).resize(size, size).png().toFile(fileURLToPath(new URL(name, root)))
  console.log('wrote', name)
}
