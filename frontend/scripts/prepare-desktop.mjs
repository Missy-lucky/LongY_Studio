import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.resolve(frontend, '..', 'desktop', 'electron')
const target = path.join(frontend, 'desktop-electron')
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })
if (!existsSync(path.join(target, 'main.cjs'))) throw new Error('desktop main process copy failed')
