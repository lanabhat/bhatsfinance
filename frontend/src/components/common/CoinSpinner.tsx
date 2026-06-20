import { useEffect, useState } from 'react'

export function CoinSpinner({ size = 56 }: { size?: number }) {
  const [phase, setPhase] = useState<'toss' | 'spin'>('toss')

  useEffect(() => {
    const t = setTimeout(() => setPhase('spin'), 900)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <style>{`
        @keyframes coin-toss {
          0%   { transform: translateY(0) rotateY(0deg) scale(1); }
          35%  { transform: translateY(-${size * 1.6}px) rotateY(480deg) scale(1.1); }
          70%  { transform: translateY(${size * 0.12}px) rotateY(900deg) scale(0.96); }
          85%  { transform: translateY(-${size * 0.04}px) rotateY(960deg) scale(1); }
          100% { transform: translateY(0) rotateY(1080deg) scale(1); }
        }
        @keyframes coin-spin {
          0%   { transform: rotateX(72deg) rotateZ(0deg) scaleX(1); }
          25%  { transform: rotateX(72deg) rotateZ(90deg) scaleX(0.12); }
          50%  { transform: rotateX(72deg) rotateZ(180deg) scaleX(1); }
          75%  { transform: rotateX(72deg) rotateZ(270deg) scaleX(0.12); }
          100% { transform: rotateX(72deg) rotateZ(360deg) scaleX(1); }
        }
        @keyframes shadow-pulse {
          0%, 100% { transform: scaleX(1); opacity: 0.22; }
          25%, 75%  { transform: scaleX(0.18); opacity: 0.08; }
          50%       { transform: scaleX(1); opacity: 0.22; }
        }
        .coin-toss {
          animation: coin-toss 0.9s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        }
        .coin-spin {
          animation: coin-spin 0.9s ease-in-out infinite;
        }
        .shadow-pulse {
          animation: shadow-pulse 0.9s ease-in-out infinite;
        }
      `}</style>

      <div style={{ perspective: '320px', height: size * 2.4 + 'px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <div
            className={phase === 'toss' ? 'coin-toss' : 'coin-spin'}
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 32%, #fef3c7, #fbbf24 38%, #d97706 68%, #92400e)',
              boxShadow: '0 3px 10px rgba(0,0,0,0.28), inset 0 1px 3px rgba(255,255,255,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: size * 0.44 + 'px',
              userSelect: 'none',
            }}
          >
            💲
          </div>
          <div
            className={phase === 'spin' ? 'shadow-pulse' : ''}
            style={{
              width: size * 0.72,
              height: size * 0.11,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.18)',
              filter: 'blur(4px)',
              opacity: phase === 'toss' ? 0 : undefined,
            }}
          />
        </div>
      </div>
    </div>
  )
}
