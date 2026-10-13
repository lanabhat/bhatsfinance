import { describe, expect, it } from 'vitest'
import { apiErrorText } from './errorUtils'

describe('apiErrorText', () => {
  it('reads every error shape the API uses', () => {
    expect(apiErrorText({ error: 'Gmail not connected' }, 'x')).toBe('Gmail not connected')
    expect(apiErrorText({ detail: 'Not found.' }, 'x')).toBe('Not found.')
    expect(apiErrorText({ detail: ['Bad date'] }, 'x')).toBe('Bad date')
    expect(apiErrorText({ balance: ['Enter a number'] }, 'x')).toBe('Enter a number')
    expect(apiErrorText(new Error('boom'), 'x')).toBe('boom')
  })

  it('falls back when there is nothing to show', () => {
    expect(apiErrorText(undefined, 'Save failed.')).toBe('Save failed.')
    expect(apiErrorText({}, 'Save failed.')).toBe('Save failed.')
    expect(apiErrorText({ detail: [] }, 'Save failed.')).toBe('Save failed.')
  })
})
