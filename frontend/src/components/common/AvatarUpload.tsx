import { useRef, useState } from 'react'
import { Avatar } from './Avatar'
import { fileToPhotoDataUri } from '../../lib/photo'

type Props = {
  photo?: string
  name: string
  size?: number
  onChange: (photoDataUri: string) => Promise<void> | void
  disabled?: boolean
}

export function AvatarUpload({ photo, name, size = 64, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const dataUri = await fileToPhotoDataUri(file)
      await onChange(dataUri)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photo.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full disabled:cursor-not-allowed"
        style={{ width: size, height: size }}
        aria-label="Change photo"
      >
        <Avatar photo={photo} name={name} size={size} />
        {!disabled && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-1/3 w-1/3">
              <path d="M4 8 a2 2 0 0 1 2 -2 h1.5 l1 -1.5 h7 l1 1.5 H18 a2 2 0 0 1 2 2 V17 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 Z" />
              <circle cx="12" cy="12.5" r="3.2" />
            </svg>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p className="max-w-[10rem] text-center text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
