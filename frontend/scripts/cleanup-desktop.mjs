import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
await rm(path.join(frontend, 'desktop-electron'), { recursive: true, force: true })
await rm(path.join(frontend, 'dist'), { recursive: true, force: true })
