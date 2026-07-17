const MAX_DIMENSION = 256
const JPEG_QUALITY = 0.82

/** Reads an image file, downscales it to fit within MAX_DIMENSION, and returns a JPEG data URI. */
export async function fileToPhotoDataUri(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
