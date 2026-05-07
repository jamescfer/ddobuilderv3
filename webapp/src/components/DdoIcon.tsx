import { useState } from 'react'

interface DdoIconProps {
  category: string
  name: string
  size?: number
  className?: string
  alt?: string
}

/** Image component that serves DDO icons from /images/<category>/<name>.png with a text fallback. */
export default function DdoIcon({ category, name, size = 32, className, alt }: DdoIconProps) {
  const [failed, setFailed] = useState(false)

  const safeName = name.replace(/[/\\?%*:|"<>]/g, '_')
  const src = `/images/${category}/${safeName}.png`

  const style: React.CSSProperties = {
    width: size,
    height: size,
    objectFit: 'contain',
    imageRendering: 'auto',
    flexShrink: 0,
  }

  if (failed) {
    return (
      <span
        className={className}
        style={{
          ...style,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(80,55,20,0.35)',
          borderRadius: 3,
          fontSize: Math.max(8, size / 4),
          color: 'rgba(200,160,80,0.6)',
          fontWeight: 700,
          overflow: 'hidden',
          userSelect: 'none',
        }}
        title={alt ?? name}
        aria-label={alt ?? name}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt ?? name}
      width={size}
      height={size}
      style={style}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}
