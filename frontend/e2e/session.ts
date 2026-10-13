import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const repo = path.resolve(here, '..', '..')
const python = path.join(repo, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

/** Run Python inside Django (manage.py shell) and return its stdout. */
export function django(code: string): string {
  return execFileSync(python, [path.join(repo, 'manage.py'), 'shell', '-c', code], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter((l) => !l.includes('objects imported automatically')).join('\n').trim()
}
