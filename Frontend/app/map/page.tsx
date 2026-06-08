'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import Navbar from '../components/Navbar'
import type { VizMode } from './types'
import type { FirePoint } from './mock-data'

// Async function to fetch fire points from our API or mock data
const getFirePoints = async (sinceHours?: number): Promise<FirePoint[]> => {
  try {
    const url = new URL('/api/fires', window.location.origin)
    if (sinceHours) {
      url.searchParams.set('sinceHours', sinceHours.toString())
    }
    const response = await fetch(url.toString())
    const data = await response.json()
    return data.points || []
  } catch (error) {
    console.error('Failed to fetch fire points:', error)
    return []
  }
}

const MapRadarView = dynamic(() => import('./map-view'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <div className="relative z-10 text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-transparent border-t-blue-500 border-r-blue-400 rounded-full animate-spin" />
            <div
              className="absolute inset-2 border-2 border-transparent border-b-orange-500 border-l-orange-400 rounded-full animate-spin"
              style={{ animationDirection: 'reverse', animationDuration: '2s' }}
            />
            <div className="absolute inset-4 rounded-full bg-slate-950" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-lg font-bold">⚡ Initializing global fire monitoring</p>
          <p className="text-sm text-slate-400 font-mono">
            <span className="text-green-400">telemetry</span> link optimizing…
          </p>
        </div>

        <div className="mt-8 bg-slate-900/50 rounded-lg p-4 w-80 border border-slate-700/50 text-left space-y-1 text-xs font-mono">
          <div className="text-green-400">{'>'} Loading Mapbox GL WebGL engine…</div>
          <div className="text-green-400">{'>'} Initializing 3D globe projection</div>
          <div className="text-blue-400 animate-pulse">{'>'} Syncing fire hotspot data…</div>
        </div>
      </div>
    </div>
  )
})

const REGION_OPTIONS = [
  'All',
  'Canada',
  'Alaska',
  'USA Contiguous & Hawaii',
  'Central America',
  'South America',
  'Europe',
  'Northern & Central Africa',
  'Southern Africa',
  'Russia Asian Part',
  'South Asia',
  'Southeast Asia',
  'Australia & New Zealand'
]

const REGION_MAP: Record<string, string> = {
  'Canada': 'Canada',
  'Alaska': 'Alaska',
  'USA Contiguous & Hawaii': 'USA_contiguous_and_Hawaii',
  'Central America': 'Central_America',
  'South America': 'South_America',
  'Europe': 'Europe',
  'Northern & Central Africa': 'Northern_and_Central_Africa',
  'Southern Africa': 'Southern_Africa',
  'Russia Asian Part': 'Russia_Asia',
  'South Asia': 'South_Asia',
  'Southeast Asia': 'SouthEast_Asia',
  'Australia & New Zealand': 'Australia_NewZealand'
}

export default function MapPage() {
  const [vizMode, setVizMode] = useState<VizMode>('both')
  const [filterOpen, setFilterOpen] = useState(true)
  const [timeWindow, setTimeWindow] = useState<'24 Hours' | '7 Days' | 'All'>('All')
  const [satelliteType, setSatelliteType] = useState<'All' | 'MODIS' | 'VIIRS NOAA-20' | 'VIIRS NOAA-21' | 'VIIRS S-NPP'>('All')
  const [region, setRegion] = useState<string>('All')
  const [ti4Min, setTi4Min] = useState('0')
  const [ti4Max, setTi4Max] = useState('400')
  const [ti5Min, setTi5Min] = useState('0')
  const [ti5Max, setTi5Max] = useState('400')
  const [frpMin, setFrpMin] = useState('0.01')
  const [frpMax, setFrpMax] = useState('400')
  const [confidence, setConfidence] = useState<string>('all')
  const [firePoints, setFirePoints] = useState<FirePoint[]>([])
  const [allFirePoints, setAllFirePoints] = useState<FirePoint[]>([]) // 存储所有原始数据
  const [selectedPoint, setSelectedPoint] = useState<FirePoint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Collapse filter panel automatically on portrait (mobile) screens to avoid overlap with map notifications
  useEffect(() => {
    const checkPortrait = () => {
      const isPortrait = window.innerHeight > window.innerWidth
      setFilterOpen(!isPortrait)
    }

    checkPortrait()
    window.addEventListener('resize', checkPortrait)
    window.addEventListener('orientationchange', checkPortrait)

    return () => {
      window.removeEventListener('resize', checkPortrait)
      window.removeEventListener('orientationchange', checkPortrait)
    }
  }, [])

  // 添加新火点到缓存
  const addFirePointToCache = useCallback((newPoint: FirePoint) => {
    const cachedData = localStorage.getItem('firePointsCache')
    let cachedPoints: FirePoint[] = []
    if (cachedData) {
      try {
        cachedPoints = JSON.parse(cachedData)
      } catch (e) {
        console.error('Failed to parse cached points:', e)
      }
    }
    const exists = cachedPoints.some(p => p.id === newPoint.id)
    if (!exists) {
      cachedPoints.unshift(newPoint)
      localStorage.setItem('firePointsCache', JSON.stringify(cachedPoints))
    }
    setAllFirePoints(prev => {
      const newAll = prev.some(p => p.id === newPoint.id) ? prev : [newPoint, ...prev]
      return newAll
    })
  }, [])


  const applyFilters = useCallback((points: FirePoint[]) => {
    let filtered = [...points]
    if (satelliteType !== 'All') {
      filtered = filtered.filter(p => p.satelliteType?.toLowerCase().includes(satelliteType.toLowerCase().replace('viirs ', '')))
    }
    if (region !== 'All') {
      const backendRegion = REGION_MAP[region]
      if (backendRegion) {
        filtered = filtered.filter(p => p.region?.toLowerCase().includes(backendRegion.toLowerCase()))
      }
    }
    if (confidence !== 'all') {
      const confLower = confidence.toLowerCase()
      filtered = filtered.filter(p => {
        const confVal = p.confidence
        const numVal = typeof confVal === 'number' ? confVal : (typeof confVal === 'string' && !isNaN(Number(confVal)) ? Number(confVal) : null)
        if (numVal !== null) {
          if (confLower === 'high') return numVal >= 66
          if (confLower === 'nominal') return numVal >= 33 && numVal < 66
          if (confLower === 'low') return numVal < 33
        }
        return p.confidence?.toString().toLowerCase() === confLower
      })
    }
    // Brightness (TI4) 
    const ti4MinNum = parseFloat(ti4Min)
    const ti4MaxNum = parseFloat(ti4Max)
    if (!isNaN(ti4MinNum) || !isNaN(ti4MaxNum)) {
      filtered = filtered.filter(p => {
        const val = p.brightness
        if (val === undefined || val === null) return false
        if (!isNaN(ti4MinNum) && val < ti4MinNum) return false
        if (!isNaN(ti4MaxNum) && val > ti4MaxNum) return false
        return true
      })
    }
    // Brightness 2 (TI5) 
    const ti5MinNum = parseFloat(ti5Min)
    const ti5MaxNum = parseFloat(ti5Max)
    if (!isNaN(ti5MinNum) || !isNaN(ti5MaxNum)) {
      filtered = filtered.filter(p => {
        const val = p.brightness_2
        if (val === undefined || val === null) return false
        if (!isNaN(ti5MinNum) && val < ti5MinNum) return false
        if (!isNaN(ti5MaxNum) && val > ti5MaxNum) return false
        return true
      })
    }
    // FRP (Fire Radiation Power) 
    const frpMinNum = parseFloat(frpMin)
    const frpMaxNum = parseFloat(frpMax)
    if (!isNaN(frpMinNum) || !isNaN(frpMaxNum)) {
      filtered = filtered.filter(p => {
        const val = p.frp
        if (val === undefined || val === null) return false
        if (!isNaN(frpMinNum) && val < frpMinNum) return false
        if (!isNaN(frpMaxNum) && val > frpMaxNum) return false
        return true
      })
    }
    setFirePoints(filtered)
  }, [satelliteType, region, confidence, ti4Min, ti4Max, ti5Min, ti5Max, frpMin, frpMax])


  const handleFirePointsChange = useCallback((points: FirePoint[]) => {
    setAllFirePoints(points)
    applyFilters(points)
  }, [applyFilters])

  // Refresh fire points from API or mock data
  const refreshData = useCallback(async () => {
    setIsLoading(true)
    try {
      let sinceHours: number | undefined
      if (timeWindow === '24 Hours') {
        sinceHours = 24
      } else if (timeWindow === '7 Days') {
        sinceHours = 24 * 7
      }
      const points = await getFirePoints(sinceHours)
      

      localStorage.setItem('firePointsCache', JSON.stringify(points))
      setAllFirePoints(points)
      setLastRefresh(new Date())
      

      applyFilters(points)
    } catch (error) {
      console.error('Failed to refresh fire points:', error)
    } finally {
      setIsLoading(false)
    }
  }, [timeWindow, applyFilters])


  useEffect(() => {

    const cachedData = localStorage.getItem('firePointsCache')
    if (cachedData) {
      try {
        const cached = JSON.parse(cachedData)
        setAllFirePoints(cached)
        applyFilters(cached)
      } catch (e) {
        console.error('Failed to parse cached data:', e)
      }
    }


    refreshData()

    const intervalId = setInterval(refreshData, 60000)
    return () => clearInterval(intervalId)
  }, [timeWindow, refreshData])


  const allFirePointsRef = useRef<FirePoint[]>([])
  useEffect(() => {

    allFirePointsRef.current = allFirePoints
  }, [allFirePoints])

  useEffect(() => {

    if (allFirePointsRef.current.length > 0) {
      applyFilters(allFirePointsRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satelliteType, region, confidence, ti4Min, ti4Max, ti5Min, ti5Max, frpMin, frpMax])

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <Navbar />



      {filterOpen ? (
        <div className="absolute top-[140px] left-6 z-40 w-[300px] sidebar p-4 rounded-[2rem] shadow-2xl border border-slate-700/50 transition-all duration-300 max-h-[calc(100vh-200px)] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-400 uppercase tracking-[0.18em]">Filter panel</div>
            {isLoading && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-blue-400">Loading...</span>
              </div>
            )}
            <button
              type="button"
              className="text-slate-400 hover:text-white transition text-lg"
              onClick={() => setFilterOpen(false)}
            >
              ←
            </button>
          </div>

          <div className="space-y-3 text-slate-200 overflow-y-auto pr-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">Time Window</label>
              <select
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value as typeof timeWindow)}
                className="w-full bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
              >
                <option>24 Hours</option>
                <option>7 Days</option>
                <option>All</option>
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">Satellite Type</label>
              <select
                value={satelliteType}
                onChange={(e) => setSatelliteType(e.target.value as typeof satelliteType)}
                className="w-full bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
              >
                <option>All</option>
                <option>MODIS</option>
                <option>VIIRS NOAA-20</option>
                <option>VIIRS NOAA-21</option>
                <option>VIIRS S-NPP</option>
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
              >
                {REGION_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">Confidence</label>
              <select
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                className="w-full bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
              >
                <option value="all">All</option>
                <option value="low">Low (L)</option>
                <option value="nominal">Nominal (N)</option>
                <option value="high">High (H)</option>
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">Brightness (K)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={ti4Min}
                  onChange={(e) => setTi4Min(e.target.value)}
                  className="bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={ti4Max}
                  onChange={(e) => setTi4Max(e.target.value)}
                  className="bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">Brightness 2 (K)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={ti5Min}
                  onChange={(e) => setTi5Min(e.target.value)}
                  className="bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={ti5Max}
                  onChange={(e) => setTi5Max(e.target.value)}
                  className="bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block">FRP (MW)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Min"
                  value={frpMin}
                  onChange={(e) => setFrpMin(e.target.value)}
                  className="bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Max"
                  value={frpMax}
                  onChange={(e) => setFrpMax(e.target.value)}
                  className="bg-slate-950/75 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1">Visualization</div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setVizMode('points')}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    vizMode === 'points'
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'bg-slate-950/85 border border-slate-700 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  Points
                </button>
                <button
                  type="button"
                  onClick={() => setVizMode('heat')}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    vizMode === 'heat'
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white'
                      : 'bg-slate-950/85 border border-slate-700 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  Heat
                </button>
                <button
                  type="button"
                  onClick={() => setVizMode('both')}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    vizMode === 'both'
                      ? 'bg-orange-500/20 text-orange-200 border border-orange-500/50'
                      : 'bg-slate-950/85 border border-slate-700 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  Overlay
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="absolute top-[140px] left-6 z-40 rounded-full bg-slate-900/90 border border-slate-700/70 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur-xl hover:bg-slate-800 transition"
        >
          Show Filters
        </button>
      )}

      

      <MapRadarView vizMode={vizMode} firePoints={firePoints} selectedPoint={selectedPoint} onSelectedPointChange={setSelectedPoint} onFirePointAdd={addFirePointToCache} onFirePointsChange={handleFirePointsChange} />
    </main>
  )
}
