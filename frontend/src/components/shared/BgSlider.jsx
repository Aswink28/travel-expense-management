import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Full-screen sliding background image carousel.
 * Images slide horizontally with a Ken Burns zoom during display.
 *
 * Props:
 *   images  – array of imported image srcs
 *   interval – ms between slides (default 7000)
 *   className – extra class on the root (for page-specific overlay tuning)
 */
export default function BgSlider({ images, interval = 7000, className = '' }) {
  const [current, setCurrent] = useState(0)
  const [prev, setPrev] = useState(null)
  const [sliding, setSliding] = useState(false)
  const timerRef = useRef(null)
  const count = images.length

  const advance = useCallback(() => {
    setSliding(true)
    setPrev(current)
    setCurrent(c => (c + 1) % count)

    // After the CSS slide transition finishes (1.2s), remove the old slide
    setTimeout(() => {
      setPrev(null)
      setSliding(false)
    }, 1200)
  }, [current, count])

  useEffect(() => {
    timerRef.current = setInterval(advance, interval)
    return () => clearInterval(timerRef.current)
  }, [advance, interval])

  return (
    <div className={`bgslider ${className}`} aria-hidden="true">
      <div className="bgslider-track">
        {/* Previous slide — slides out to the left */}
        {prev !== null && (
          <div className="bgslider-slide bgslider-slide--out" key={`out-${prev}`}>
            <img src={images[prev]} alt="" className="bgslider-img" />
          </div>
        )}

        {/* Current slide — slides in from the right */}
        <div
          className={`bgslider-slide ${sliding ? 'bgslider-slide--in' : 'bgslider-slide--active'}`}
          key={`in-${current}`}
        >
          <img src={images[current]} alt="" className="bgslider-img" />
        </div>
      </div>

      {/* Overlays for theme adaptation */}
      <div className="bgslider-overlay" />
      <div className="bgslider-gradient" />

      {/* Slide indicators */}
      <div className="bgslider-dots">
        {images.map((_, i) => (
          <span
            key={i}
            className={`bgslider-dot ${i === current ? 'bgslider-dot--active' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
