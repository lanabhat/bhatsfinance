import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
import { django } from './session'

// Log in as the first approved super admin with a fresh session (no Google OAuth needed).
export default async function globalSetup() {
  const key = django(`
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.auth import SESSION_KEY, BACKEND_SESSION_KEY, HASH_SESSION_KEY
from core.models import UserProfile
p = UserProfile.objects.filter(status='approved', role='super_admin').select_related('user').first()
s = SessionStore()
s[SESSION_KEY] = str(p.user.pk); s[BACKEND_SESSION_KEY] = 'django.contrib.auth.backends.ModelBackend'
s[HASH_SESSION_KEY] = p.user.get_session_auth_hash(); s['e2e'] = True; s.create()
print(s.session_key)`).split('\n').pop()!
  const host = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:5173').hostname
  fs.mkdirSync(path.join(here, '.auth'), { recursive: true })
  fs.writeFileSync(path.join(here, '.auth', 'state.json'), JSON.stringify({
    cookies: [{ name: 'sessionid', value: key, domain: host, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }],
    origins: [],
  }))
}
