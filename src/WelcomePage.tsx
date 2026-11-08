import { useEffect, useState } from 'react'

export default function WelcomePage({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<'ignite' | 'reveal' | 'fading'>('ignite')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 500)
    const t2 = setTimeout(() => setPhase('fading'), 2400)
    const t3 = setTimeout(() => onFinish(), 3200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onFinish])

  return (
    <div className="welcome-page">
      <button className="welcome-skip" onClick={onFinish} aria-label="Skip intro">Skip</button>
      <div className="welcome-core">
        <div className="welcome-glow welcome-glow--primary" />
        <div className="welcome-glow welcome-glow--secondary" />
        <div className="welcome-particle welcome-particle--1" />
        <div className="welcome-particle welcome-particle--2" />
        <div className="welcome-particle welcome-particle--3" />
        <div className="welcome-particle welcome-particle--4" />
        <div className="welcome-particle welcome-particle--5" />
        <div className="welcome-particle welcome-particle--6" />
        <div className="welcome-ring welcome-ring--outer" />
        <div className="welcome-ring welcome-ring--inner" />
        <div className="welcome-core--dot" />
      </div>

      {phase === 'reveal' && (
        <div className="welcome-reveal">
          <div className="welcome-wordmark">dexmitra.</div>
          <div className="welcome-tagline">Institutional DeFi Terminal</div>
        </div>
      )}

      {phase === 'fading' && <div className="welcome-fade-overlay" />}
    </div>
  )
}
