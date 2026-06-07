'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'

const majorFireEvents24h = [
  { time: '00:40', brightness: 326, region: 'South America' },
  { time: '02:15', brightness: 338, region: 'Central Africa' },
  { time: '04:30', brightness: 349, region: 'SouthEast Asia' },
  { time: '06:05', brightness: 358, region: 'Australia' },
  { time: '08:50', brightness: 344, region: 'South Asia' },
  { time: '11:20', brightness: 372, region: 'Northern Africa' },
  { time: '13:35', brightness: 363, region: 'Europe' },
  { time: '15:10', brightness: 389, region: 'Russia Asia' },
  { time: '17:45', brightness: 354, region: 'Canada' },
  { time: '20:05', brightness: 376, region: 'Alaska' },
  { time: '22:30', brightness: 341, region: 'USA' },
  { time: '23:45', brightness: 366, region: 'Amazon Basin' }
]

const parseGmtHour = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return hour + minute / 60
}

const getBrightnessColor = (brightness: number) => {
  if (brightness >= 380) return '#fee2e2'
  if (brightness >= 365) return '#ef4444'
  if (brightness >= 350) return '#f97316'
  if (brightness >= 335) return '#facc15'
  return '#38bdf8'
}

export default function FireNetSections() {
  const router = useRouter()
  const chartMetrics = useMemo(() => {
    const brightnessValues = majorFireEvents24h.map((event) => event.brightness)
    const minBrightness = Math.min(...brightnessValues) - 8
    const maxBrightness = Math.max(...brightnessValues) + 8

    return {
      minBrightness,
      maxBrightness,
      points: majorFireEvents24h.map((event) => ({
        ...event,
        x: (parseGmtHour(event.time) / 24) * 100,
        y: 100 - ((event.brightness - minBrightness) / (maxBrightness - minBrightness)) * 100,
        color: getBrightnessColor(event.brightness)
      }))
    }
  }, [])

  return (
    <div className="mt-32 space-y-32 pb-24">
      {/* Section 1 — FireNet intro + brightness scatter */}
      <section className="max-w-6xl mx-auto text-center px-4">
        <div className="flex justify-center mb-6">
          <div className="text-5xl" aria-hidden>
            🔥🌲
          </div>
        </div>
        <p className="text-slate-500 text-sm mb-4">May 19, 2026</p>
        <h2 className="text-3xl md:text-4xl font-bold text-white leading-snug mb-4">
          Dynamic monitoring of global fire activity within 24 hours with visual analytics
        </h2>
        <p className="text-slate-400 text-sm mb-8">
          Data sourced from NASA VIIRS 375m Active Fire product
        </p>
        <button
          type="button"
          onClick={() => router.push('/map')}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-violet-900/80 hover:bg-violet-800/90 border border-violet-600/50 text-white text-sm font-medium transition mb-10"
        >
          <span aria-hidden>🚀</span>
          Try it out
        </button>
        <p className="text-slate-300 text-sm md:text-base leading-relaxed text-left md:text-center max-w-3xl mx-auto mb-12">
          FireNet is built on high-resolution hotspot data products and can identify global fire
          occurrence time patterns, such as peak fire seasons. Fire-point brightness temperature in
          the 4&nbsp;μm channel and Fire Radiative Power (FRP) reflect fire intensity—higher
          brightness temperatures and larger FRP values usually indicate more severe fires. Dynamic
          fire data visualization helps users understand fire activity across regions and time,
          supporting global fire management and decision-making.
        </p>
        <h3 className="text-lg font-semibold text-white mb-6">
          Global 24h major fire occurrence time vs. fire-point brightness temperature
        </h3>
        <div className="rounded-2xl overflow-hidden border border-slate-800/80 bg-[#0a1628] shadow-2xl h-[min(560px,70vw)] relative px-10 pb-20 pt-12 md:pl-36 md:pr-14">
          <div className="absolute right-5 top-5 z-10 rounded-2xl border border-slate-700/70 bg-slate-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Color Temperature</div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span>Low</span>
              <div className="h-2 w-28 rounded-full bg-gradient-to-r from-sky-400 via-yellow-300 via-orange-500 to-red-400" />
              <span>High</span>
            </div>
          </div>

          <div className="absolute left-10 right-10 top-12 bottom-24 md:left-36 md:right-14">
            {[0, 1, 2, 3, 4].map((line) => (
              <div
                key={line}
                className="absolute left-0 right-0 border-t border-slate-800/80"
                style={{ top: `${line * 25}%` }}
              />
            ))}
            {[0, 6, 12, 18, 24].map((hour) => (
              <div
                key={hour}
                className="absolute top-0 bottom-0 border-l border-slate-800/70"
                style={{ left: `${(hour / 24) * 100}%` }}
              />
            ))}

            {chartMetrics.points.map((point) => (
              <div
                key={`${point.time}-${point.region}`}
                className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 hover:z-[80]"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              >
                <div
                  className="h-4 w-4 rounded-full border-2 border-white/80 shadow-lg transition-transform duration-200 group-hover:scale-150"
                  style={{
                    backgroundColor: point.color,
                    boxShadow: `0 0 18px ${point.color}`
                  }}
                />
                <div
                  className={`pointer-events-none absolute left-1/2 z-[100] hidden w-48 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-2xl group-hover:block ${
                    point.y > 68 ? 'bottom-6' : 'top-6'
                  }`}
                >
                  <div className="font-semibold text-orange-300">{point.region}</div>
                  <div className="mt-1 text-slate-400">GMT: <span className="text-slate-100 font-mono">{point.time}</span></div>
                  <div className="text-slate-400">Brightness: <span className="text-slate-100 font-mono">{point.brightness} K</span></div>
                </div>
              </div>
            ))}
          </div>

          <div className="absolute left-4 top-12 bottom-24 flex flex-col justify-between text-[10px] text-slate-500 md:left-28">
            {[chartMetrics.maxBrightness, Math.round((chartMetrics.maxBrightness + chartMetrics.minBrightness) / 2), chartMetrics.minBrightness].map((value) => (
              <span key={value}>{value}K</span>
            ))}
          </div>

          <div className="absolute left-10 right-10 bottom-12 flex justify-between text-[10px] text-slate-500 md:left-36 md:right-14">
            {[0, 6, 12, 18, 24].map((hour) => (
              <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
            ))}
          </div>

          <div className="absolute left-3 top-12 bottom-24 flex w-14 items-center justify-center text-[10px] font-medium uppercase tracking-widest text-slate-500 md:left-6 md:w-20 md:text-xs">
            <span className="-rotate-90 whitespace-nowrap">Fire-point Brightness Temperature (K)</span>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] font-medium uppercase tracking-widest text-slate-500 md:text-xs">
            Fire Occurrence Time (GMT)
          </div>
        </div>
      </section>


      {/* Section 3 — NDVI quality control + hex heatmap */}
      <section className="max-w-4xl mx-auto text-center px-4">
        <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-4">
          FireNet achieves high-quality upstream fire-point data quality control through
          multi-source data cross-referencing.
        </p>
        <p className="text-slate-400 text-sm md:text-base leading-relaxed text-left md:text-center max-w-3xl mx-auto mb-6">
          Fire points are screened using NDVI (Normalized Difference Vegetation Index). NDVI is
          calculated from near-infrared and red bands as{' '}
          <span className="text-slate-200 font-mono text-xs">(NIR − R) / (NIR + R)</span>, reflecting
          vegetation growth and cover. It is especially effective at separating vegetation from
          industrial sites and urban heat islands. Combined with fire-detection algorithms, NDVI
          helps identify true fire points and reduce false positives from other high-temperature
          sources (urban heat islands, industrial heat, etc.).
        </p>
      </section>
    </div>
  )
}
