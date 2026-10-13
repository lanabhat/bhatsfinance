import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteJson, getJson, patchJson, postForm, postJson } from './http'

type Call = { url: string; init: RequestInit }

function mockFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Call[] = []
  let i = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const r = responses[Math.min(i++, responses.length - 1)]
    const status = r.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status })
  }))
  return calls
}

describe('http', () => {
  beforeEach(() => { document.cookie = 'csrftoken=abc123' })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('GET sends the session cookie and no CSRF header', async () => {
    const calls = mockFetch([{ body: { ok: true } }])
    expect(await getJson('/api/x')).toEqual({ ok: true })
    expect(calls[0].init.credentials).toBe('include')
    expect((calls[0].init.headers as Record<string, string>)['X-CSRFToken']).toBeUndefined()
  })

  it('writes send the CSRF token and a JSON body', async () => {
    const calls = mockFetch([{ body: { id: 1 } }])
    await postJson('/api/x', { a: 1 })
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-CSRFToken']).toBe('abc123')
    expect(headers['Content-Type']).toBe('application/json')
    expect(calls[0].init.body).toBe('{"a":1}')
  })

  it('fetches the CSRF cookie first when it is missing', async () => {
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    const calls = mockFetch([{ body: {} }, { body: { id: 1 } }])
    await patchJson('/api/x/1/', { b: 2 })
    expect(calls[0].url).toBe('/api/csrf/')
    expect(calls[1].init.method).toBe('PATCH')
  })

  it('throws the server error body on a non-2xx response', async () => {
    mockFetch([{ status: 400, body: { detail: 'Fields not editable' } }])
    await expect(postJson('/api/x', {})).rejects.toEqual({ detail: 'Fields not editable' })
  })

  it('treats 204 as success with an empty body', async () => {
    mockFetch([{ status: 204 }])
    await expect(deleteJson('/api/x/1/')).resolves.toBeUndefined()
    await expect(postJson('/api/x', {})).resolves.toEqual({})
  })

  it('postForm sends FormData without a JSON content type', async () => {
    const calls = mockFetch([{ body: { id: 9 } }])
    const fd = new FormData()
    fd.append('file', new Blob(['x']), 'a.csv')
    await postForm('/api/upload', fd)
    expect(calls[0].init.body).toBe(fd)
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('passes the abort signal through', async () => {
    const calls = mockFetch([{ body: {} }])
    const controller = new AbortController()
    await getJson('/api/x', { signal: controller.signal })
    expect(calls[0].init.signal).toBe(controller.signal)
  })
})
