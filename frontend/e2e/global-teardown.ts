import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
import { django } from './session'

export default async function globalTeardown() {
  const file = path.join(here, '.auth', 'state.json')
  if (!fs.existsSync(file)) return
  const key = JSON.parse(fs.readFileSync(file, 'utf8')).cookies[0]?.value
  if (key) django(`from django.contrib.sessions.models import Session; Session.objects.filter(session_key='${key}').delete()`)
  fs.rmSync(file)
}
