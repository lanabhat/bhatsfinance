type Props = {
  photo?: string
  name: string
  size?: number
  className?: string
}

export function Avatar({ photo, name, size = 32, className = '' }: Props) {
  const style = { width: size, height: size }
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.4 }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 ${className}`}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}
