'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, Map, Marker } from 'mapbox-gl'

import { firePointsToGeoJSON, heatmapMaxIntensity } from './fire-geo'
import type { FirePoint } from './mock-data'
import type { VizMode } from './types'

/**
 * Confidence 数据格式化模块
 * 用于将后端返回的 confidence 字段转换为用户友好的展示文本
 */

/** Confidence 字符串类型的映射表 */
const CONFIDENCE_STRING_MAP: Record<string, { label: string; level: 'HIGH' | 'MEDIUM' | 'LOW' }> = {
  l: { label: 'Low', level: 'LOW' },
  n: { label: 'Nominal', level: 'MEDIUM' },
  h: { label: 'High', level: 'HIGH' },
  low: { label: 'Low', level: 'LOW' },
  nominal: { label: 'Nominal', level: 'MEDIUM' },
  high: { label: 'High', level: 'HIGH' },
}

/** Confidence 等级对应的颜色类名 */
const CONFIDENCE_LEVEL_COLOR: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'text-red-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-yellow-400',
}

/** Confidence 等级对应的图标 */
const CONFIDENCE_LEVEL_ICON: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: '●',
  MEDIUM: '◐',
  LOW: '○',
}

/**
 * 格式化 confidence 数据的展示结果
 */
interface FormattedConfidence {
  /** 显示文本 */
  display: string
  /** 风险等级 */
  level: 'HIGH' | 'MEDIUM' | 'LOW' | null
  /** 是否为有效数据 */
  isValid: boolean
}

/**
 * 将原始 confidence 数据转换为展示文本
 * @param raw 原始 confidence 值（字符串 "l"/"n"/"h" 或数字 0-100）
 * @returns 格式化结果，包含显示文本、等级、有效性
 */
function formatConfidence(raw: string | number | null | undefined): FormattedConfidence {
  // 空值或 undefined
  if (raw === null || raw === undefined || raw === '') {
    return { display: 'N/A', level: null, isValid: false }
  }

  // 字符串类型处理
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase()
    const mapped = CONFIDENCE_STRING_MAP[lower]
    if (mapped) {
      return {
        display: mapped.label,
        level: mapped.level,
        isValid: true,
      }
    }
    // 字符串数字处理（如 "38"）
    const num = Number(lower)
    if (!isNaN(num) && num >= 0 && num <= 100) {
      return formatNumericConfidence(num)
    }
    return { display: 'N/A', level: null, isValid: false }
  }

  // 数字类型处理
  if (typeof raw === 'number') {
    if (raw >= 0 && raw <= 100) {
      return formatNumericConfidence(raw)
    }
    return { display: 'N/A', level: null, isValid: false }
  }

  return { display: 'N/A', level: null, isValid: false }
}

/**
 * 将 0-100 范围的数值 confidence 转换为展示文本
 * @param num 0-100 范围的数值
 */
function formatNumericConfidence(num: number): FormattedConfidence {
  if (num < 0 || num > 100 || isNaN(num)) {
    return { display: 'N/A', level: null, isValid: false }
  }
  // 根据数值划分等级
  // >= 66 为 HIGH，33-65 为 MEDIUM，< 33 为 LOW
  const level: 'HIGH' | 'MEDIUM' | 'LOW' = num >= 66 ? 'HIGH' : num >= 33 ? 'MEDIUM' : 'LOW'
  const label = level === 'HIGH' ? 'High' : level === 'MEDIUM' ? 'Nominal' : 'Low'
  return {
    display: `${label} (${num}%)`,
    level,
    isValid: true,
  }
}

const DB_NAME = 'fire-admin-db'

const openDB = async () => {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in the browser')
  }
  return new Promise<any>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

const getPublishedFireEvents = async (): Promise<FirePoint[]> => {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('fireEvents', 'readonly')
      const store = transaction.objectStore('fireEvents')
      const request = store.getAll()
      request.onsuccess = () => {
        const events = request.result || []
        const published = events
          .filter((e: any) => e.published === true || e.status === 'Published')
          .map((e: any): FirePoint => ({
            id: String(e.id),
            WKT: e.WKT || `POINT(${e.longitude} ${e.latitude})`,
            latitude: e.latitude,
            longitude: e.longitude,
            brightness: e.brightness || 300,
            scan: e.scan || 1.0,
            track: e.track || 1.0,
            acq_date: e.acq_date || '',
            acq_time: e.acq_time || '',
            acq_datetime: e.acq_datetime || '',
            confidence: e.confidence || 'nominal',
            brightness_2: e.brightness_2 || 290,
            frp: e.frp || 0,
            region: e.region ?? null,
            satelliteType: e.satelliteType ?? null,
            uniqueKey: e.uniqueKey ?? null,
            source: e.source ?? null,
            sourceCount: e.sourceCount ?? null,
            otherSources: e.otherSources ?? null,
            level: e.level,
            locationName: e.locationName
          }))
        resolve(published)
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return []
  }
}

const mapConfidenceToLevel = (confidence: string | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' => {
  if (!confidence) return 'LOW'
  const conf = confidence.toLowerCase()
  if (conf === 'high' || conf === 'h') return 'HIGH'
  if (conf === 'nominal' || conf === 'n') return 'MEDIUM'
  if (conf === 'low' || conf === 'l') return 'LOW'
  const numericValue = parseFloat(conf)
  if (!isNaN(numericValue)) {
    if (numericValue >= 66) return 'HIGH'
    if (numericValue >= 33) return 'MEDIUM'
    return 'LOW'
  }
  return 'LOW'
}

const formatSatelliteType = (satelliteType: string | null | undefined): string => {
  if (!satelliteType) return 'N/A'
  const type = satelliteType.toLowerCase()
  if (type.includes('modis')) return 'MODIS'
  if (type.includes('noaa20') || type.includes('noaa-20')) return 'VIIRS NOAA-20'
  if (type.includes('noaa21') || type.includes('noaa-21')) return 'VIIRS NOAA-21'
  if (type.includes('snpp')) return 'VIIRS S-NPP'
  return satelliteType
}

const formatRegion = (region: string | null | undefined): string => {
  if (!region) return 'N/A'
  
  const regionMap: Record<string, string> = {
    'Canada': 'Canada',
    'Alaska': 'Alaska',
    'USA_contiguous_and_Hawaii': 'USA Contiguous & Hawaii',
    'Central_America': 'Central America',
    'South_America': 'South America',
    'Europe': 'Europe',
    'Northern_and_Central_Africa': 'Northern & Central Africa',
    'Southern_Africa': 'Southern Africa',
    'Russia_Asia': 'Russia Asian Part',
    'South_Asia': 'South Asia',
    'SouthEast_Asia': 'Southeast Asia',
    'Australia_NewZealand': 'Australia & New Zealand'
  }
  
  return regionMap[region] || region
}

const convertEventToFirePoint = (event: any): FirePoint => ({
  id: String(event.id),
  WKT: event.WKT || `POINT(${event.longitude} ${event.latitude})`,
  latitude: event.latitude,
  longitude: event.longitude,
  brightness: event.brightness || 300,
  scan: event.scan || 1.0,
  track: event.track || 1.0,
  acq_date: event.acq_date || '',
  acq_time: event.acq_time || '',
  acq_datetime: event.acq_datetime || '',
  confidence: event.confidence || 'nominal',
  brightness_2: event.brightness_2 || 290,
  frp: event.frp || event.intensityValue || 0,
  region: event.region ?? null,
  satelliteType: event.satelliteType ?? null,
  uniqueKey: event.uniqueKey ?? null,
  source: event.source ?? null,
  sourceCount: event.sourceCount ?? null,
  otherSources: event.otherSources ?? null,
  level: event.level,
  locationName: event.locationName
})

type MapboxGL = typeof import('mapbox-gl').default

const MAP_STYLES = {
  base: {
    label: 'Base Map',
    style: 'mapbox://styles/mapbox/streets-v12'
  },
  satellite: {
    label: 'Satellite',
    style: 'mapbox://styles/mapbox/satellite-v9'
  },
  radar: {
    label: 'Night Radar',
    style: 'mapbox://styles/mapbox/dark-v11'
  }
} as const

type MapStyleKey = keyof typeof MAP_STYLES

const isPortraitViewport = () => {
  if (typeof window === 'undefined') return false
  return window.innerHeight > window.innerWidth
}

const getFireApprovalNotificationClass = (isPortrait: boolean) => {
  if (isPortrait) {
    return 'fixed left-4 right-4 z-[60] bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl text-white w-auto max-w-[calc(100vw-2rem)] animate-[slideInUp_0.5s_ease-out] border border-red-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[min(70vh,calc(100vh-140px))]'
  }
  return 'fixed left-1/2 -ml-[210px] z-[60] bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl text-white w-[420px] animate-[slideInDown_0.5s_ease-out] border border-red-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-180px)]'
}

const getZoneApprovalNotificationClass = (isPortrait: boolean) => {
  if (isPortrait) {
    return 'fixed left-4 right-4 z-[60] bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl text-white w-auto max-w-[calc(100vw-2rem)] animate-[slideInUp_0.5s_ease-out] border border-orange-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[min(70vh,calc(100vh-140px))]'
  }
  return 'fixed left-1/2 -ml-[210px] z-[60] bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl text-white w-[420px] animate-[slideInDown_0.5s_ease-out] border border-orange-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-180px)]'
}

interface MapRadarViewProps {
  vizMode?: VizMode
  onFirePointsChange?: (points: FirePoint[]) => void
  onSelectedPointChange?: (point: FirePoint | null) => void
  onFirePointAdd?: (point: FirePoint) => void
  firePoints?: FirePoint[]
  selectedPoint?: FirePoint | null
}

interface Particle {
  id: string
  lng: number
  lat: number
  life: number
  maxLife: number
  drift: number
  size: number
}

interface PopupPosition {
  left: number
  top: number
}

const FIRE_DETAILS_CARD_WIDTH = 300
const FIRE_DETAILS_CARD_MAX_HEIGHT = 420
const FIRE_DETAILS_CARD_OFFSET = 18

let mapboxModule: MapboxGL | null = null

async function loadMapbox(): Promise<MapboxGL> {
  if (typeof window === 'undefined') {
    throw new Error('Mapbox GL can only load in the browser')
  }
  if (!mapboxModule) {
    const mod = await import('mapbox-gl')
    const mapboxgl = mod.default

    // Required for Next.js/webpack — otherwise tiles often never load (grey globe)
    mapboxgl.workerUrl = `${window.location.origin}/mapbox-gl-csp-worker.js`
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
    mapboxModule = mapboxgl
  }
  return mapboxModule
}

function setupGlobeAtmosphere(map: Map, styleKey: MapStyleKey) {
  map.setProjection('globe')

  if (styleKey === 'radar') {
    map.setFog({
      color: 'rgb(8, 16, 32)',
      'high-color': 'rgb(30, 80, 180)',
      'horizon-blend': 0.03,
      'space-color': 'rgb(2, 4, 12)',
      'star-intensity': 0.45
    })
    return
  }

  map.setFog({
    color: 'rgb(160, 190, 220)',
    'high-color': 'rgb(80, 140, 220)',
    'horizon-blend': 0.02,
    'space-color': 'rgb(8, 12, 28)',
    'star-intensity': 0.2
  })
}

const CLUSTER_MAX_ZOOM = 10

function createFireMarkerElement(point: FirePoint, onSelect: (p: FirePoint) => void) {
  const el = document.createElement('div')
  el.className = 'fire-marker'
  let markerColor = '#f59e0b'

  if (point.level === 'HIGH') {
    markerColor = '#dc2626'
    el.style.animation = 'radarPulse 2s cubic-bezier(0, 0, 0.2, 1) infinite'
    el.style.boxShadow = '0 0 12px rgba(220, 38, 38, 0.8)'
  } else if (point.level === 'MEDIUM') {
    markerColor = '#ea580c'
    el.style.animation = 'breathingGlow 3s ease-in-out infinite'
    el.style.boxShadow = '0 0 8px rgba(234, 88, 12, 0.6)'
  } else {
    el.style.boxShadow = '0 0 4px rgba(245, 158, 11, 0.4)'
  }

  el.style.backgroundColor = markerColor
  el.style.width = '16px'
  el.style.height = '16px'
  el.style.borderRadius = '50%'
  el.style.cursor = 'pointer'
  el.style.border = '2px solid rgba(255,255,255,0.9)'

  el.addEventListener('click', () => onSelect(point))
  return el
}

export default function MapRadarView({ vizMode = 'both', firePoints: externalFirePoints, selectedPoint: externalSelectedPoint, onFirePointsChange, onSelectedPointChange, onFirePointAdd }: MapRadarViewProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<Map | null>(null)
  const mapboxRef = useRef<MapboxGL | null>(null)
  const markersRef = useRef<Marker[]>([])
  const particlesRef = useRef<Particle[]>([])
  const animFrameRef = useRef<number>(0)
  const styleReadyRef = useRef(false)
  const firePointsRef = useRef<FirePoint[]>([])
  const prevStyleRef = useRef<MapStyleKey | null>(null)
  // 跟踪已显示的审批通知 ID（防止重复弹出）
  const shownNotificationsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map())
  // 跟踪当前所有活跃的通知元素
  const activeNotificationsRef = useRef<Set<HTMLElement>>(new Set())
  // 待批量显示的火点队列
  const pendingBatchPointsRef = useRef<Array<{ point: FirePoint; addedAt: number }>>([])
  // 批量通知的延迟 timer
  const batchNotificationTimerRef = useRef<number | null>(null)
  // 批量通知的抽屉状态
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false)
  const [batchDrawerPoints, setBatchDrawerPoints] = useState<FirePoint[]>([])
  // Zone 批量通知抽屉状态
  const [batchZoneDrawerOpen, setBatchZoneDrawerOpen] = useState(false)
  const [batchDrawerZones, setBatchDrawerZones] = useState<any[]>([])
  // Zone 批量通知队列和 timer
  const pendingBatchZonesRef = useRef<Array<{ zone: any; addedAt: number }>>([])
  const batchZoneNotificationTimerRef = useRef<number | null>(null)
  // 批量飞向 zones 的收集器和定时器
  const pendingFlyToZonesRef = useRef<any[]>([])
  const zoneFlyTimerRef = useRef<number | null>(null)
  const BATCH_FLY_DELAY = 800 // 800ms 内连续的 zoneApproved 合并为一次飞向
  const NOTIFICATION_DEDUPE_WINDOW = 30000 // 30 秒内不重复弹出同一火点通知
  const MAX_CONCURRENT_NOTIFICATIONS = 3 // 同时最多显示的通知数量
  const BATCH_NOTIFICATION_DELAY = 2000 // 2 秒延迟，用于聚合批量通知
  const ZONE_NOTIFICATION_DURATION = 6000 // Zone 通知显示时长
  const FIRE_NOTIFICATION_DURATION = 6000 // Fire approval 通知显示时长

  const [localFirePoints, setLocalFirePoints] = useState<FirePoint[]>([])
  const firePoints = externalFirePoints ?? localFirePoints
  firePointsRef.current = firePoints
  
  const [localSelectedPoint, setLocalSelectedPoint] = useState<FirePoint | null>(null)
  const selectedPoint = externalSelectedPoint ?? localSelectedPoint
  const [detailsPosition, setDetailsPosition] = useState<PopupPosition | null>(null)

  const calculateDetailsPosition = useCallback((point: FirePoint): PopupPosition | null => {
    const map = mapInstance.current
    const container = mapContainer.current
    if (!map || !container) return null

    const projected = map.project([point.longitude, point.latitude])
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    const hasRoomRight = projected.x + FIRE_DETAILS_CARD_OFFSET + FIRE_DETAILS_CARD_WIDTH <= containerWidth - 16

    const left = hasRoomRight
      ? projected.x + FIRE_DETAILS_CARD_OFFSET
      : projected.x - FIRE_DETAILS_CARD_WIDTH - FIRE_DETAILS_CARD_OFFSET

    return {
      left: Math.max(16, Math.min(left, containerWidth - FIRE_DETAILS_CARD_WIDTH - 16)),
      top: Math.max(16, Math.min(projected.y - 24, containerHeight - FIRE_DETAILS_CARD_MAX_HEIGHT - 16))
    }
  }, [])

  const handleSelectPoint = (point: FirePoint | null) => {
    setLocalSelectedPoint(point)
    setDetailsPosition(point ? calculateDetailsPosition(point) : null)
    onSelectedPointChange?.(point)
  }
  const [showHUD, setShowHUD] = useState(false)
  const [activeStyle, setActiveStyle] = useState<MapStyleKey>('base')
  const [mapReady, setMapReady] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')
  const [mapError, setMapError] = useState<string | null>(null)
  const [tokenMissing, setTokenMissing] = useState(false)
  const [layersOpen, setLayersOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [showZones, setShowZones] = useState(true)
  const [zones, setZones] = useState<Array<{
    zoneId: string
    name: string
    description: string
    minLatitude: number
    maxLatitude: number
    minLongitude: number
    maxLongitude: number
    polygonCoords: string | null
    riskLevel: string
    historicalIncidents: number
  }>>([])


  const maxIntensity = useMemo(() => heatmapMaxIntensity(firePoints), [firePoints])
  const fireGeoJSON = useMemo(() => firePointsToGeoJSON(firePoints), [firePoints])
  
  const zonesGeoJSON = useMemo(() => {
    const features = zones.map((zone) => {
      const coordinates = zone.polygonCoords
        ? JSON.parse(zone.polygonCoords)
        : [
            [zone.minLongitude, zone.minLatitude],
            [zone.maxLongitude, zone.minLatitude],
            [zone.maxLongitude, zone.maxLatitude],
            [zone.minLongitude, zone.maxLatitude],
            [zone.minLongitude, zone.minLatitude]
          ]

      return {
        type: 'Feature' as const,
        properties: {
          zoneId: zone.zoneId,
          name: zone.name,
          description: zone.description,
          riskLevel: zone.riskLevel,
          historicalIncidents: zone.historicalIncidents
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coordinates]
        }
      }
    })

    return {
      type: 'FeatureCollection' as const,
      features
    }
  }, [zones])

  const loadZones = useCallback(async () => {
    try {
      const response = await fetch('/api/fires/zones', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`)
      }
      const data = await response.json()
      setZones(data.data || [])
    } catch (error) {
      console.error('[Map] Failed to load high risk zones:', error)
    }
  }, [])

  useEffect(() => {
    setTokenMissing(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN)
  }, [])

  useEffect(() => {
    if (!mapReady) return
    loadZones()
  }, [mapReady, loadZones])

  useEffect(() => {
    if (externalFirePoints) return
    // 如果有外部数据，就不用从IndexedDB加载
  }, [externalFirePoints, onFirePointsChange])

  const performSearch = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchError('Please enter a location name.')
      return
    }

    const token = mapboxRef.current?.accessToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
    if (!token) {
      setSearchError('Mapbox token missing for search.')
      return
    }

    setSearching(true)
    setSearchError(null)

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&autocomplete=false&language=en&access_token=${token}`
      )

      if (!response.ok) {
        throw new Error('Geocoding request failed')
      }

      const data = await response.json() as {
        features?: Array<{
          center: [number, number]
          place_name: string
        }>
      }

      if (!data.features?.length) {
        setSearchError(`No location found for "${query}".`)
        return
      }

      const [lng, lat] = data.features[0].center
      const map = mapInstance.current
      if (!map) return

      map.flyTo({
        center: [lng, lat],
        zoom: 10,
        pitch: 45,
        bearing: map.getBearing(),
        essential: true,
        duration: 1300
      })
    } catch (error) {
      setSearchError((error as Error).message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
  }, [])

  const syncMarkersRef = useRef((map: Map, mapboxgl: MapboxGL, points: FirePoint[]) => {})
  syncMarkersRef.current = (map: Map, mapboxgl: MapboxGL, points: FirePoint[]) => {
    clearMarkers()
    if (vizMode === 'heat') return

    points.forEach((point) => {
      const el = createFireMarkerElement(point, handleSelectPoint)
      const marker = new mapboxgl.Marker(el).setLngLat([point.longitude, point.latitude]).addTo(map)
      markersRef.current.push(marker)
    })
  }
  
  const syncMarkers = useCallback((map: Map, mapboxgl: MapboxGL, points: FirePoint[]) => {
    syncMarkersRef.current(map, mapboxgl, points)
  }, [])

  const updateDisplayByZoom = useCallback((map: Map, mapboxgl: MapboxGL, points: FirePoint[]) => {
    const currentZoom = map.getZoom()
    const clusterMaxZoom = CLUSTER_MAX_ZOOM

    if (currentZoom >= clusterMaxZoom && vizMode !== 'heat') {
      // 缩放级别足够大，显示 DOM Markers，隐藏聚类图层
      syncMarkersRef.current(map, mapboxgl, points)
      setVisibility('fire-clusters-layer', false, map)
      setVisibility('fire-cluster-counts-layer', false, map)
      setVisibility('fire-points-layer', false, map)
    } else {
      // 缩放级别小，显示聚类图层，隐藏 DOM Markers
      clearMarkers()
      setVisibility('fire-clusters-layer', vizMode !== 'heat', map)
      setVisibility('fire-cluster-counts-layer', vizMode !== 'heat', map)
      setVisibility('fire-points-layer', vizMode !== 'heat', map)
    }
  }, [vizMode])

  const setVisibility = (layerId: string, visible: boolean, map: Map) => {
    if (!map.getLayer(layerId)) return
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }

  const addFireLayers = useCallback((map: Map) => {
    if (!map.getSource('fire-points')) {
      map.addSource('fire-points', {
        type: 'geojson',
        data: fireGeoJSON,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 50
      })
    } else {
      ;(map.getSource('fire-points') as GeoJSONSource).setData(fireGeoJSON)
    }

    if (!map.getSource('fire-particles')) {
      map.addSource('fire-particles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
    }

    const showHeat = vizMode === 'heat' || vizMode === 'both'
    const showPoints = vizMode === 'points' || vizMode === 'both'

    if (!map.getLayer('fire-heatmap') && showHeat) {
      map.addLayer({
        id: 'fire-heatmap',
        type: 'heatmap',
        source: 'fire-points',
        maxzoom: 18,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'intensityValue'],
            0, 0,
            maxIntensity, 1
          ],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1.2, 6, 2.5, 12, 4],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.15, 'rgba(56,189,248,0.35)',
            0.35, 'rgba(251,191,36,0.65)',
            0.55, 'rgba(249,115,22,0.85)',
            0.75, 'rgba(239,68,68,0.95)',
            1, 'rgba(220,38,38,1)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 18, 4, 35, 8, 55, 12, 80],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 10, 0.55, 18, 0]
        }
      })
    }

    if (!map.getLayer('fire-clusters-layer')) {
      map.addLayer({
        id: 'fire-clusters-layer',
        type: 'circle',
        source: 'fire-points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#facc15',
            10, '#f97316',
            50, '#ef4444',
            100, '#dc2626'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            10, 30,
            50, 40,
            100, 50
          ],
          'circle-opacity': 0.7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      })
    }

    if (!map.getLayer('fire-cluster-counts-layer')) {
      map.addLayer({
        id: 'fire-cluster-counts-layer',
        type: 'symbol',
        source: 'fire-points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      })
    }

    if (!map.getLayer('fire-points-layer')) {
      map.addLayer({
        id: 'fire-points-layer',
        type: 'circle',
        source: 'fire-points',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 10, 12, 14],
          'circle-color': [
            'match',
            ['get', 'level'],
            'HIGH', '#ef4444',
            'MEDIUM', '#f97316',
            'LOW', '#facc15',
            '#f59e0b'
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.95
        }
      })
    }

    if (!map.getLayer('fire-particles-layer')) {
      map.addLayer({
        id: 'fire-particles-layer',
        type: 'circle',
        source: 'fire-particles',
        paint: {
          'circle-radius': ['get', 'size'],
          'circle-color': '#fb923c',
          'circle-opacity': ['get', 'opacity'],
          'circle-blur': 0.6
        }
      })
    }

    if (!map.getSource('high-risk-zones')) {
      map.addSource('high-risk-zones', { type: 'geojson', data: zonesGeoJSON })
    } else {
      ;(map.getSource('high-risk-zones') as GeoJSONSource).setData(zonesGeoJSON)
    }

    if (!map.getLayer('high-risk-zones-fill')) {
      map.addLayer({
        id: 'high-risk-zones-fill',
        type: 'fill',
        source: 'high-risk-zones',
        minzoom: 2,
        paint: {
          'fill-color': [
            'match',
            ['get', 'riskLevel'],
            'high', 'rgba(239, 68, 68, 0.35)',
            'medium', 'rgba(249, 115, 22, 0.3)',
            'low', 'rgba(251, 191, 36, 0.25)',
            'rgba(200, 200, 200, 0.2)'
          ],
          'fill-outline-color': [
            'match',
            ['get', 'riskLevel'],
            'high', 'rgba(239, 68, 68, 0.8)',
            'medium', 'rgba(249, 115, 22, 0.7)',
            'low', 'rgba(251, 191, 36, 0.6)',
            'rgba(200, 200, 200, 0.5)'
          ],
          'fill-opacity': 0.8
        }
      })
    }

    if (!map.getLayer('high-risk-zones-border')) {
      map.addLayer({
        id: 'high-risk-zones-border',
        type: 'line',
        source: 'high-risk-zones',
        minzoom: 2,
        paint: {
          'line-color': [
            'match',
            ['get', 'riskLevel'],
            'high', 'rgba(239, 68, 68, 0.9)',
            'medium', 'rgba(249, 115, 22, 0.8)',
            'low', 'rgba(251, 191, 36, 0.7)',
            'rgba(200, 200, 200, 0.6)'
          ],
          'line-width': 2,
          'line-opacity': 0.85
        }
      })
    }

    // 先设置热力图和高风险区域图层的可见性
    const initialSetVisibility = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      }
    }
    initialSetVisibility('fire-heatmap', showHeat)
    initialSetVisibility('fire-particles-layer', showHeat)
    initialSetVisibility('high-risk-zones-fill', showZones)
    initialSetVisibility('high-risk-zones-border', showZones)
    
    // 根据当前缩放级别设置火点显示方式
    updateDisplayByZoom(map, mapboxRef.current!, firePointsRef.current)
  }, [fireGeoJSON, maxIntensity, vizMode, zonesGeoJSON, showZones, updateDisplayByZoom])

  const seedParticles = useCallback((points: FirePoint[]) => {
    const hot = points.filter((p) => p.level !== 'LOW')
    const seeds: Particle[] = []

    hot.forEach((point, index) => {
      const count = point.level === 'HIGH' ? 14 : 8
      for (let i = 0; i < count; i++) {
        seeds.push({
          id: `${point.id}-${index}-${i}`,
          lng: point.longitude + (Math.random() - 0.5) * 0.35,
          lat: point.latitude + (Math.random() - 0.5) * 0.25,
          life: Math.random(),
          maxLife: 0.6 + Math.random() * 0.8,
          drift: 0.0008 + Math.random() * 0.002,
          size: 2 + Math.random() * 3
        })
      }
    })

    particlesRef.current = seeds
  }, [])

  const animateParticles = useCallback(() => {
    const map = mapInstance.current
    if (!map || !styleReadyRef.current) return

    const source = map.getSource('fire-particles') as GeoJSONSource | undefined
    if (!source) return

    particlesRef.current = particlesRef.current
      .map((p) => ({
        ...p,
        lat: p.lat + p.drift,
        life: p.life + 0.018
      }))
      .filter((p) => p.life < p.maxLife)

    if (particlesRef.current.length < 120) {
      seedParticles(firePointsRef.current)
    }

    source.setData({
      type: 'FeatureCollection',
      features: particlesRef.current.map((p) => ({
        type: 'Feature',
        properties: {
          size: p.size * (1 - p.life / p.maxLife),
          opacity: Math.max(0, 0.85 * (1 - p.life / p.maxLife))
        },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
      }))
    })

    animFrameRef.current = requestAnimationFrame(animateParticles)
  }, [seedParticles])

  const onStyleReadyRef = useRef((map: Map, mapboxgl: MapboxGL, styleKey: MapStyleKey) => {})
  onStyleReadyRef.current = (map: Map, mapboxgl: MapboxGL, styleKey: MapStyleKey) => {
    setupGlobeAtmosphere(map, styleKey)
    clearMarkers()
    addFireLayers(map)
    seedParticles(firePointsRef.current)
    map.resize()
    styleReadyRef.current = true
    setMapReady(true)
    setMapError(null)
  }
  
  const onStyleReady = useCallback((map: Map, mapboxgl: MapboxGL, styleKey: MapStyleKey) => {
    onStyleReadyRef.current(map, mapboxgl, styleKey)
  }, [])

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current || tokenMissing) return

    let destroyed = false

    loadMapbox()
      .then((mapboxgl) => {
        if (destroyed || !mapContainer.current) return

        mapboxRef.current = mapboxgl

        const initialStyle = MAP_STYLES[activeStyle].style

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: initialStyle,
          center: [20, 25],
          zoom: 1.8,
          pitch: 32,
          bearing: -12,
          antialias: true,
          projection: 'globe',
          attributionControl: true
        })

        mapInstance.current = map
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')
        map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), 'bottom-left')

        map.on('error', (e) => {
          const message = e.error?.message ?? 'Map tile loading failed'
          if (message.includes('401') || message.includes('403')) {
            setMapError('Invalid or expired Mapbox token. Check NEXT_PUBLIC_MAPBOX_TOKEN.')
          }
        })

        map.on('style.load', () => onStyleReady(map, mapboxgl, activeStyle))
        
        map.on('click', 'fire-clusters-layer', (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ['fire-clusters-layer']
          })
          const clusterId = features[0].properties?.cluster_id
          if (clusterId === undefined) return
          
          const fireSource = map.getSource('fire-points') as GeoJSONSource
          fireSource.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null) return
            const coordinates: [number, number] = features[0].geometry.type === 'Point'
              ? features[0].geometry.coordinates as [number, number]
              : [0, 0]
            map.easeTo({
              center: coordinates,
              zoom: zoom
            })
          })
        })
        
        map.on('click', 'fire-points-layer', (e) => {
          const feature = e.features?.[0]
          const id = feature?.properties?.id as string | undefined
          if (!id) return
          const point = firePointsRef.current.find((p) => p.id === id)
          if (point) handleSelectPoint(point)
        })
        
        map.on('mouseenter', 'fire-clusters-layer', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'fire-clusters-layer', () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'fire-points-layer', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'fire-points-layer', () => { map.getCanvas().style.cursor = '' })
        
        // 添加 zoom 监听器，根据缩放级别切换显示方式
        // 使用 firePointsRef.current 读取最新数据，避免闭包陷阱
        map.on('zoom', () => {
          updateDisplayByZoom(map, mapboxgl, firePointsRef.current)
        })
      })
      .catch((err: Error) => {
        setMapError(err.message || 'Failed to load map')
      })

    return () => {
      destroyed = true
      cancelAnimationFrame(animFrameRef.current)
      clearMarkers()
      mapInstance.current?.remove()
      mapInstance.current = null
      styleReadyRef.current = false
      setMapReady(false)
    }
  }, [clearMarkers, tokenMissing])

  // Collapse search + base layers panels automatically on portrait (mobile) screens
  useEffect(() => {
    const checkPortrait = () => {
      const isPortrait = isPortraitViewport()
      setLayersOpen(!isPortrait)
      setSearchOpen(!isPortrait)
    }

    // Check on initial mount
    checkPortrait()

    // Listen to resize and orientation changes
    const handleResize = () => checkPortrait()
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return
    const source = map.getSource('fire-points') as GeoJSONSource | undefined
    source?.setData(fireGeoJSON)
    seedParticles(firePointsRef.current)
    updateDisplayByZoom(map, mapboxgl, firePointsRef.current)
  }, [fireGeoJSON, mapReady, seedParticles, updateDisplayByZoom])

  useEffect(() => {
    const map = mapInstance.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return
    addFireLayers(map)
  }, [vizMode, mapReady, addFireLayers])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady) return
    const source = map.getSource('high-risk-zones') as GeoJSONSource | undefined
    source?.setData(zonesGeoJSON)
  }, [zonesGeoJSON, mapReady])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady || !selectedPoint) return
    const targetZoom = Math.max(map.getZoom(), 8.5)
    map.flyTo({
      center: [selectedPoint.longitude, selectedPoint.latitude],
      zoom: targetZoom,
      pitch: 45,
      bearing: map.getBearing(),
      essential: true,
      duration: 1200
    })
  }, [selectedPoint, mapReady])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady || !selectedPoint) return

    const updateDetailsPosition = () => {
      setDetailsPosition(calculateDetailsPosition(selectedPoint))
    }

    updateDetailsPosition()
    map.on('move', updateDetailsPosition)
    map.on('zoom', updateDetailsPosition)
    map.on('resize', updateDetailsPosition)

    return () => {
      map.off('move', updateDetailsPosition)
      map.off('zoom', updateDetailsPosition)
      map.off('resize', updateDetailsPosition)
    }
  }, [calculateDetailsPosition, mapReady, selectedPoint])

  useEffect(() => {
    const map = mapInstance.current
    const mapboxgl = mapboxRef.current
    if (!map || !mapboxgl || !mapReady) return

    if (prevStyleRef.current === null) {
      prevStyleRef.current = activeStyle
      return
    }
    if (prevStyleRef.current === activeStyle) return

    prevStyleRef.current = activeStyle
    styleReadyRef.current = false
    map.setStyle(MAP_STYLES[activeStyle].style)
    map.once('style.load', () => onStyleReady(map, mapboxgl, activeStyle))
  }, [activeStyle, mapReady, onStyleReady])

  useEffect(() => {
    if (!mapReady) return
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(animateParticles)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [animateParticles, mapReady])

  useEffect(() => {
    if (externalFirePoints) return
    const loadFires = async () => {
      console.log('[Map] Starting to load fire data...')
      try {
        const res = await fetch('/api/fires?sinceHours=24', { cache: 'no-store' })
        console.log('[Map] API response status:', res.status)
        
        if (!res.ok) {
          throw new Error(`API responded with status ${res.status}`)
        }
        
        const data = await res.json() as { points: FirePoint[]; updatedAt: string; total: number }
        console.log('[Map] Received data:', data.points.length, 'points, total:', data.total)
        
        if (!data.points || data.points.length === 0) {
          console.log('[Map] No recent fire data in the last 24 hours')
          setLocalFirePoints([])
          onFirePointsChange?.([])
          return
        }
        
        const firePoints = data.points.map((point: any): FirePoint => ({
          id: String(point.id),
          WKT: point.WKT || `POINT(${point.longitude} ${point.latitude})`,
          latitude: point.latitude,
          longitude: point.longitude,
          brightness: point.brightness || 300,
          scan: point.scan || 1.0,
          track: point.track || 1.0,
          acq_date: point.acq_date || '',
          acq_time: point.acq_time || '',
          acq_datetime: point.acq_datetime || point.acqDatetime || '',
          confidence: point.confidence || 'nominal',
          brightness_2: point.brightness_2 || point.brightness2 || 290,
          frp: point.frp || 0,
          region: point.region ?? null,
          satelliteType: point.satelliteType ?? null,
          uniqueKey: point.uniqueKey ?? null,
          source: point.source ?? null,
          sourceCount: point.sourceCount ?? null,
          otherSources: point.otherSources ?? null,
          level: mapConfidenceToLevel(point.confidence),
          locationName: point.region || point.locationName || 'Unknown Location'
        }))
        console.log('[Map] Setting fire points:', firePoints.length)
        setLocalFirePoints(firePoints)
        onFirePointsChange?.(firePoints)
        setLastSync(new Date().toLocaleTimeString('en-US'))
      } catch (error) {
        console.error('[Map] Failed to load fire data:', error)
        console.log('[Map] No fallback data available')
        setLocalFirePoints([])
        onFirePointsChange?.([])
      }
    }

    loadFires()
    const timer = setInterval(loadFires, 60_000)
    return () => clearInterval(timer)
  }, [externalFirePoints, onFirePointsChange])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const wsUrl = `ws://localhost:8000/ws/notifications`
    console.log('[Map] WebSocket connecting to:', wsUrl)
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[Map] WebSocket connected')
    }

    ws.onclose = () => {
      console.log('[Map] WebSocket disconnected')
    }

    ws.onerror = (error) => {
      console.error('[Map] WebSocket error:', error)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('[Map] WebSocket received message:', message)
        if (message.type === 'fireEventApproved' && message.point) {
          console.log('[Map] fireEventApproved received, point:', message.point)
          showApprovalAlert(message.point)
        } else if (message.type === 'fireEventsUpdated') {
          const loadTimer = setTimeout(() => {
            loadFiresFromAPI()
          }, 1000)
          return () => clearTimeout(loadTimer)
        } else if (message.type === 'zoneApproved' && message.zone) {
          console.log('[Map] zoneApproved received:', message.zone)
          const zone = message.zone

          pendingFlyToZonesRef.current.push(zone)

          if (zoneFlyTimerRef.current !== null) {
            clearTimeout(zoneFlyTimerRef.current)
          }
          zoneFlyTimerRef.current = window.setTimeout(() => {
            flushPendingFlyToZones()
          }, BATCH_FLY_DELAY)

          showZoneApprovedAlert(zone)

          loadZones()
        }
      } catch (error) {
        console.error('[Map] WebSocket failed to parse message:', error)
      }
    }

    return () => ws.close()
  }, [mapReady])

  const debounceTimerRef = useRef<number | null>(null)
  
  const loadFiresFromAPI = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/fires?sinceHours=24', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const firePoints = data.points?.map((point: any): FirePoint => ({
          id: String(point.id),
          latitude: point.latitude,
          longitude: point.longitude,
          brightness: point.brightness || 300,
          scan: point.scan || 1.0,
          track: point.track || 1.0,
          acq_date: point.acq_date || '',
          acq_time: point.acq_time || '',
          acq_datetime: point.acq_datetime || point.acqDatetime || '',
          confidence: point.confidence || 'nominal',
          brightness_2: point.brightness_2 || point.brightness2 || 290,
          frp: point.frp || 0,
          region: point.region ?? null,
          satelliteType: point.satelliteType ?? null,
          uniqueKey: point.uniqueKey ?? null,
          source: point.source ?? null,
          sourceCount: point.sourceCount ?? null,
          otherSources: point.otherSources ?? null,
          level: mapConfidenceToLevel(point.confidence),
          locationName: point.region || point.locationName || 'Unknown Location'
        })) || []
        
        if (firePoints.length > 0) {
          setLocalFirePoints(firePoints)
          onFirePointsChange?.(firePoints)
        }
      } catch (error) {
        console.error('[Map] Failed to reload fire data:', error)
      }
    }, 1500)
  }, [onFirePointsChange])

  const showApprovalAlert = (point: FirePoint) => {
    console.log('[Map] showApprovalAlert called with point:', point)


    const pointId = String(point.id)
    const now = Date.now()
    const lastShown = shownNotificationsRef.current.get(pointId)
    if (lastShown && now - lastShown < NOTIFICATION_DEDUPE_WINDOW) {
      console.log('[Map] Notification deduplicated for fire point:', pointId)
      return
    }

    shownNotificationsRef.current.set(pointId, now)

    for (const [id, timestamp] of shownNotificationsRef.current.entries()) {
      if (now - timestamp > NOTIFICATION_DEDUPE_WINDOW) {
        shownNotificationsRef.current.delete(id)
      }
    }

    setShowHUD(true)


    pendingBatchPointsRef.current.push({
      point,
      addedAt: now,
    })

    if (batchNotificationTimerRef.current !== null) {
      return
    }

    batchNotificationTimerRef.current = window.setTimeout(() => {
      flushBatchNotification()
    }, BATCH_NOTIFICATION_DELAY)
  }


  const showZoneApprovedAlert = (zone: any) => {
    setShowHUD(true)


    const zoneId = String(zone.zoneId)
    const now = Date.now()
    const lastShown = shownNotificationsRef.current.get(`zone-${zoneId}`)
    if (lastShown && now - lastShown < NOTIFICATION_DEDUPE_WINDOW) {
      console.log('[Map] Zone notification deduplicated:', zoneId)
      return
    }
    shownNotificationsRef.current.set(`zone-${zoneId}`, now)


    pendingBatchZonesRef.current.push({
      zone,
      addedAt: now,
    })

    if (batchZoneNotificationTimerRef.current !== null) {
      return
    }

    batchZoneNotificationTimerRef.current = window.setTimeout(() => {
      flushBatchZoneNotification()
    }, BATCH_NOTIFICATION_DELAY)
  }


  const flushPendingFlyToZones = () => {
    zoneFlyTimerRef.current = null
    const zones = pendingFlyToZonesRef.current.splice(0)
    if (zones.length === 0) return

    if (!mapInstance.current || !mapboxRef.current) return


    let largestZone = zones[0]
    let largestSize = 0
    zones.forEach(zone => {
      const width = (zone.maxLongitude - zone.minLongitude) * Math.cos(zone.minLatitude * Math.PI / 180)
      const height = zone.maxLatitude - zone.minLatitude
      const area = width * height
      const incidents = zone.historicalIncidents || 0

      const score = area * 1000 + incidents
      const largestScore = ((largestZone.maxLongitude - largestZone.minLongitude) * Math.cos(largestZone.minLatitude * Math.PI / 180)) * ((largestZone.maxLatitude - largestZone.minLatitude) * 1000 + (largestZone.historicalIncidents || 0))
      if (score > largestScore) {
        largestZone = zone
      }
    })

    const sw: [number, number] = [largestZone.minLongitude, largestZone.minLatitude]
    const ne: [number, number] = [largestZone.maxLongitude, largestZone.maxLatitude]

    console.log(`[Map] Flying to largest zone: ${largestZone.name}`)
    mapInstance.current.fitBounds(new mapboxRef.current.LngLatBounds(sw, ne), {
      padding: 80,
      maxZoom: 12,
      pitch: 30,
      bearing: 0,
      duration: 2500
    })
  }


  const flushBatchZoneNotification = () => {
    batchZoneNotificationTimerRef.current = null
    const zones = pendingBatchZonesRef.current.splice(0)
    if (zones.length === 0) return


    if (zones.length === 1) {
      showSingleZoneNotification(zones[0].zone)
    } else {
      showBatchZoneSummaryNotification(zones.map(z => z.zone))
    }
  }


  const showSingleZoneNotification = (zone: any) => {
    const notification = createZoneNotificationElement({
      type: 'single',
      zone,
    })
    showNotificationElementWithTimeout(notification, ZONE_NOTIFICATION_DURATION)
  }


  const showBatchZoneSummaryNotification = (zones: any[]) => {
    const notification = createZoneNotificationElement({
      type: 'batch',
      zones,
    })
    showNotificationElementWithTimeout(notification, ZONE_NOTIFICATION_DURATION)
  }


  const createZoneNotificationElement = (data: { type: 'single'; zone: any } | { type: 'batch'; zones: any[] }): HTMLElement => {
    const notification = document.createElement('div')
    const isPortrait = isPortraitViewport()
    notification.className = getZoneApprovalNotificationClass(isPortrait)
    const offset = activeNotificationsRef.current.size * 90
    if (isPortrait) {
      notification.style.bottom = `${24 + offset}px`
    } else {
      notification.style.top = `${100 + offset}px`
    }

    if (data.type === 'single') {

      const zone = data.zone
      const riskLevel = zone.riskLevel || 'MEDIUM'
      const riskColorClass = riskLevel === 'HIGH'
        ? 'text-red-400'
        : riskLevel === 'MEDIUM' ? 'text-orange-400' : 'text-yellow-400'

      notification.innerHTML = `
        <div class="relative">
          <div class="absolute inset-0 bg-gradient-to-r from-orange-600/0 via-orange-600/5 to-red-600/0 pointer-events-none"></div>
          <div class="relative p-5 space-y-3">
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <div class="font-bold text-base text-orange-400 tracking-wide">High-Risk Zone</div>
                <div class="text-xs text-slate-400 mt-1">Newly published risk zone on the map</div>
              </div>
            </div>
            <div class="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Name:</span>
                <span class="font-semibold text-slate-200">${zone.name || 'Unnamed Zone'}</span>
              </div>
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Risk Level:</span>
                <span class="font-semibold ${riskColorClass}">${riskLevel}</span>
              </div>
              ${zone.historicalIncidents ? `
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Incidents:</span>
                <span class="font-mono text-slate-200">${zone.historicalIncidents}</span>
              </div>
              ` : ''}
              ${zone.approvedBy ? `
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">By:</span>
                <span class="text-slate-200">${zone.approvedBy}</span>
              </div>
              ` : ''}
            </div>
          </div>
          <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500/30"></div>
        </div>
      `


      notification.style.cursor = 'pointer'
      notification.onclick = (e) => {

        if ((e.target as HTMLElement).closest('button')) return
        console.log('[Map] Zone notification clicked:', zone)
        console.log('[Map] zone.minLatitude:', zone.minLatitude, 'zone.maxLatitude:', zone.maxLatitude)
        console.log('[Map] zone.minLongitude:', zone.minLongitude, 'zone.maxLongitude:', zone.maxLongitude)
        if (mapInstance.current && mapboxRef.current) {
          const sw: [number, number] = [zone.minLongitude, zone.minLatitude]
          const ne: [number, number] = [zone.maxLongitude, zone.maxLatitude]
          console.log('[Map] sw:', sw, 'ne:', ne)
          console.log('[Map] sw.every(Number.isFinite):', sw.every(Number.isFinite), 'ne.every(Number.isFinite):', ne.every(Number.isFinite))
          if (sw.every(Number.isFinite) && ne.every(Number.isFinite)) {
            const bounds = new mapboxRef.current.LngLatBounds(sw, ne)
            console.log('[Map] bounds:', bounds)
            mapInstance.current.fitBounds(bounds, {
              padding: 80,
              maxZoom: 12,
              pitch: 30,
              bearing: 0,
              duration: 2500
            })
          }
        }
      }
    } else {

      const zones = data.zones
      const riskCount = { HIGH: 0, MEDIUM: 0, LOW: 0 }
      zones.forEach((z: any) => {
        const r: 'HIGH' | 'MEDIUM' | 'LOW' = z.riskLevel || 'MEDIUM'
        if (r === 'HIGH' || r === 'MEDIUM' || r === 'LOW') {
          riskCount[r]++
        } else {
          riskCount.MEDIUM++
        }
      })

      notification.innerHTML = `
        <div class="relative overflow-y-auto">
          <div class="absolute inset-0 bg-gradient-to-r from-orange-600/0 via-orange-600/5 to-red-600/0 pointer-events-none"></div>
          <div class="relative p-5 space-y-3">
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <div class="font-bold text-base text-orange-400 tracking-wide">New Zones Published</div>
                <div class="text-xs text-slate-400 mt-1">Admin has batch-published ${zones.length} high-risk zones</div>
              </div>
              <button class="close-notification-btn text-slate-400 hover:text-white text-lg leading-none p-1" type="button" aria-label="Close">×</button>
            </div>
            <div class="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
              <div class="text-slate-300">
                <span>Total: <span class="font-bold text-orange-300">${zones.length}</span> new zones${riskCount.HIGH > 0 ? ` (<span class="text-red-400">${riskCount.HIGH}</span> high-risk)` : ''}</span>
              </div>
              <div class="text-slate-300">
                <span class="text-slate-400">Risk:</span> <span class="text-slate-200">${riskCount.HIGH} HIGH, ${riskCount.MEDIUM} MEDIUM, ${riskCount.LOW} LOW</span>
              </div>
            </div>
            <div class="flex gap-2 pt-2">
              <button class="batch-view-map-btn flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white text-sm font-semibold py-2 px-4 rounded-xl transition-all" type="button">
                View on Map
              </button>
              <button class="batch-view-list-btn flex-1 bg-slate-700/80 hover:bg-slate-600 text-white text-sm font-semibold py-2 px-4 rounded-xl transition-all border border-slate-600" type="button">
                View List
              </button>
            </div>
          </div>
          <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500/30"></div>
        </div>
      `


      const closeBtn = notification.querySelector('.close-notification-btn') as HTMLButtonElement | null
      const viewMapBtn = notification.querySelector('.batch-view-map-btn') as HTMLButtonElement | null
      const viewListBtn = notification.querySelector('.batch-view-list-btn') as HTMLButtonElement | null
      const removeNotification = () => {
        notification.classList.add('animate-[slideOutUp_0.3s_ease-in]')
        setTimeout(() => notification.remove(), 300)
      }
      if (closeBtn) closeBtn.onclick = removeNotification
      if (viewMapBtn) {
        viewMapBtn.onclick = () => {
          // fitBounds to all zones
          if (mapInstance.current && mapboxRef.current && zones.length > 0) {
            const bounds = new mapboxRef.current.LngLatBounds()
            zones.forEach(z => bounds.extend([z.minLongitude, z.minLatitude]))
            zones.forEach(z => bounds.extend([z.maxLongitude, z.maxLatitude]))
            mapInstance.current.fitBounds(bounds, {
              padding: 80,
              duration: 2000,
              maxZoom: 8,
            })
          }
          removeNotification()
        }
      }
      if (viewListBtn) {
        viewListBtn.onclick = () => {

          setBatchDrawerZones(zones)
          setBatchZoneDrawerOpen(true)
          removeNotification()
        }
      }
    }
    return notification
  }


  const showNotificationElementWithTimeout = (notification: HTMLElement, duration: number = 6000) => {

    while (activeNotificationsRef.current.size >= MAX_CONCURRENT_NOTIFICATIONS) {
      const oldest = activeNotificationsRef.current.values().next().value
      if (oldest) {
        oldest.classList.add('animate-[slideOutUp_0.3s_ease-in]')
        setTimeout(() => oldest.remove(), 300)
        activeNotificationsRef.current.delete(oldest)
      } else {
        break
      }
    }

    document.body.appendChild(notification)
    activeNotificationsRef.current.add(notification)
    const observer = new MutationObserver(() => {
      if (!document.body.contains(notification)) {
        activeNotificationsRef.current.delete(notification)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true })


    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.classList.add('animate-[slideOutUp_0.3s_ease-in]')
        setTimeout(() => {
          if (document.body.contains(notification)) {
            notification.remove()
          }
        }, 300)
      }
    }, duration)
  }


  const flushBatchNotification = () => {
    batchNotificationTimerRef.current = null
    const points = pendingBatchPointsRef.current.splice(0) // 清空并获取
    if (points.length === 0) return


    fetch('/api/fires?sinceHours=24', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        const firePoints: FirePoint[] = (data.points || []).map((point: any): FirePoint => ({
          id: String(point.id),
          WKT: point.WKT || `POINT(${point.longitude} ${point.latitude})`,
          latitude: point.latitude,
          longitude: point.longitude,
          brightness: point.brightness || 300,
          scan: point.scan || 1.0,
          track: point.track || 1.0,
          acq_date: point.acq_date || '',
          acq_time: point.acq_time || '',
          acq_datetime: point.acq_datetime || point.acqDatetime || '',
          confidence: point.confidence || 'nominal',
          brightness_2: point.brightness_2 || point.brightness2 || 290,
          frp: point.frp || 0,
          region: point.region ?? null,
          satelliteType: point.satelliteType ?? null,
          uniqueKey: point.uniqueKey ?? null,
          source: point.source ?? null,
          sourceCount: point.sourceCount ?? null,
          otherSources: point.otherSources ?? null,
          level: mapConfidenceToLevel(point.confidence),
          locationName: point.region || point.locationName || 'Unknown Location'
        }))


        const queuePoints: FirePoint[] = points.map((p) => {
          const pt = p.point as any
          return {
            id: String(pt.id),
            WKT: `POINT(${pt.longitude} ${pt.latitude})`,
            latitude: pt.latitude,
            longitude: pt.longitude,
            brightness: 300,
            scan: 1.0,
            track: 1.0,
            acq_date: '',
            acq_time: '',
            acq_datetime: '',
            confidence: 'nominal',
            brightness_2: 290,
            frp: 0,
            region: null,
            satelliteType: null,
            uniqueKey: null,
            source: null,
            sourceCount: null,
            otherSources: null,
            level: pt.level || 'MEDIUM',
            locationName: pt.locationName || 'Unknown Location'
          }
        })


        const merged: FirePoint[] = [...firePoints]
        for (const qp of queuePoints) {
          if (!merged.some((m) => m.id === qp.id)) {
            merged.push(qp)
          }
        }

        setLocalFirePoints(merged)
        onFirePointsChange?.(merged)

        if (mapInstance.current && mapboxRef.current) {
          if (points.length === 1) {
            mapInstance.current.flyTo({
              center: [points[0].point.longitude, points[0].point.latitude],
              zoom: 10,
              essential: true,
              duration: 3000
            })
          } else {
            const bounds = new mapboxRef.current.LngLatBounds()
            points.forEach(p => bounds.extend([p.point.longitude, p.point.latitude]))
            mapInstance.current.fitBounds(bounds, {
              padding: 80,
              duration: 2000,
              maxZoom: 8
            })
          }
        }
      })
      .catch(err => console.error('[Map] Failed to load full fire data:', err))


    if (points.length === 1) {
      showSinglePointNotification(points[0].point)
    } else {
      showBatchSummaryNotification(points.map(p => p.point))
    }

    setTimeout(() => setShowHUD(false), 5800)
  }


  const showSinglePointNotification = (point: FirePoint) => {
    const notification = createNotificationElement({
      type: 'single',
      point,
    })
    showNotificationElementWithTimeout(notification, FIRE_NOTIFICATION_DURATION)
  }


  const showBatchSummaryNotification = (points: FirePoint[]) => {
    const notification = createNotificationElement({
      type: 'batch',
      points,
    })
    showNotificationElementWithTimeout(notification, FIRE_NOTIFICATION_DURATION)
  }


  const createNotificationElement = (data: { type: 'single'; point: FirePoint } | { type: 'batch'; points: FirePoint[] }): HTMLElement => {
    const notification = document.createElement('div')
    const isPortrait = isPortraitViewport()
    notification.className = getFireApprovalNotificationClass(isPortrait)

    const offset = activeNotificationsRef.current.size * 90
    if (isPortrait) {
      notification.style.bottom = `${24 + offset}px`
    } else {
      notification.style.top = `${100 + offset}px`
    }

    if (data.type === 'single') {

      const point = data.point
      notification.innerHTML = `
        <div class="relative">
          <div class="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/5 to-orange-600/0 pointer-events-none"></div>
          <div class="relative p-5 space-y-3">
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <div class="font-bold text-base text-orange-400 tracking-wide">Fire Event Approved</div>
                <div class="text-xs text-slate-400 mt-1">Newly published thermal hotspot</div>
              </div>
              <button class="close-notification-btn text-slate-400 hover:text-white text-lg leading-none p-1" type="button" aria-label="Close">×</button>
            </div>
            <div class="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Risk Level:</span>
                <span class="font-semibold text-red-400">${point.level || 'MEDIUM'}</span>
              </div>
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Location:</span>
                <span>${point.locationName || 'Unknown Location'} · (${point.latitude?.toFixed(4)}°, ${point.longitude?.toFixed(4)}°)</span>
              </div>
            </div>
          </div>
          <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500/30"></div>
        </div>
      `

      const closeBtn = notification.querySelector('.close-notification-btn') as HTMLButtonElement | null
      if (closeBtn) {
        closeBtn.onclick = () => {
          notification.classList.add('animate-[slideOutUp_0.3s_ease-in]')
          setTimeout(() => notification.remove(), 300)
        }
      }
    } else {

      const points = data.points
      const regionSet = new Set<string>()
      let highCount = 0
      points.forEach(p => {
        const region = p.region || p.locationName || 'Unknown'
        regionSet.add(region)
        if (p.level === 'HIGH') highCount++
      })
      const regions = Array.from(regionSet)
      const regionText = regions.length <= 3
        ? regions.join(', ')
        : `${regions.slice(0, 3).join(', ')} and ${regions.length - 3} more`

      notification.dataset.batchId = String(Date.now())
      notification.innerHTML = `
        <div class="relative overflow-y-auto">
          <div class="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/5 to-orange-600/0 pointer-events-none"></div>
          <div class="relative p-5 space-y-3">
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <div class="font-bold text-base text-orange-400 tracking-wide">New Fire Events Published</div>
                <div class="text-xs text-slate-400 mt-1">Admin has batch-published ${points.length} fire events</div>
              </div>
              <button class="close-notification-btn text-slate-400 hover:text-white text-lg leading-none p-1" type="button" aria-label="Close">×</button>
            </div>
            <div class="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Count:</span>
                <span>${points.length} new fire events${highCount > 0 ? ` (<span class="text-red-400 font-bold">${highCount}</span> high-risk)` : ''}</span>
              </div>
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <span class="font-semibold text-slate-500">Regions:</span>
                <span>Across <span class="font-bold text-blue-300">${regionSet.size}</span> regions: <span class="text-slate-200">${regionText}</span></span>
              </div>
            </div>
            <div class="flex gap-2 pt-2">
              <button class="batch-view-map-btn flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white text-sm font-semibold py-2 px-4 rounded-xl transition-all" type="button">
                View on Map
              </button>
              <button class="batch-view-list-btn flex-1 bg-slate-700/80 hover:bg-slate-600 text-white text-sm font-semibold py-2 px-4 rounded-xl transition-all border border-slate-600" type="button">
                View List
              </button>
            </div>
          </div>
          <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500/30"></div>
        </div>
      `


      const closeBtn = notification.querySelector('.close-notification-btn') as HTMLButtonElement | null
      const viewMapBtn = notification.querySelector('.batch-view-map-btn') as HTMLButtonElement | null
      const viewListBtn = notification.querySelector('.batch-view-list-btn') as HTMLButtonElement | null
      const removeNotification = () => {
        notification.classList.add('animate-[slideOutUp_0.3s_ease-in]')
        setTimeout(() => notification.remove(), 300)
      }
      if (closeBtn) closeBtn.onclick = removeNotification
      if (viewMapBtn) {
        viewMapBtn.onclick = () => {
          // fitBounds to all points (使用 mapboxRef 而非 window.mapboxgl)
          if (mapInstance.current && mapboxRef.current && points.length > 0) {
            const bounds = new mapboxRef.current.LngLatBounds()
            points.forEach(p => bounds.extend([p.longitude, p.latitude]))
            mapInstance.current.fitBounds(bounds, {
              padding: 80,
              duration: 2000,
              maxZoom: 8,
            })
          }
          removeNotification()
        }
      }
      if (viewListBtn) {
        viewListBtn.onclick = () => {

          setBatchDrawerPoints(points)
          setBatchDrawerOpen(true)
          removeNotification()
        }
      }
    }
    return notification
  }


  const showNotificationElement = (notification: HTMLElement) => {

    while (activeNotificationsRef.current.size >= MAX_CONCURRENT_NOTIFICATIONS) {
      const oldest = activeNotificationsRef.current.values().next().value
      if (oldest) {
        oldest.classList.add('animate-[slideOutUp_0.3s_ease-in]')
        setTimeout(() => oldest.remove(), 300)
        activeNotificationsRef.current.delete(oldest)
      } else {
        break
      }
    }

    document.body.appendChild(notification)

    activeNotificationsRef.current.add(notification)

    const observer = new MutationObserver(() => {
      if (!document.body.contains(notification)) {
        activeNotificationsRef.current.delete(notification)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true })
  }


  useEffect(() => {
    return () => {
      if (batchNotificationTimerRef.current !== null) {
        clearTimeout(batchNotificationTimerRef.current)
        batchNotificationTimerRef.current = null
      }
      if (batchZoneNotificationTimerRef.current !== null) {
        clearTimeout(batchZoneNotificationTimerRef.current)
        batchZoneNotificationTimerRef.current = null
      }
    }
  }, [])

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full bg-slate-950" />

      {tokenMissing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-8">
          <div className="max-w-md text-center space-y-4">
            <p className="text-orange-400 font-semibold text-lg">Mapbox token required</p>
            <p className="text-slate-400 text-sm">
              Add <code className="text-slate-200">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{' '}
              <code className="text-slate-200">.env.local</code> in the project root.
            </p>
          </div>
        </div>
      )}

      {mapError && !tokenMissing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-8">
          <div className="max-w-md text-center space-y-3">
            <p className="text-red-400 font-semibold">Map failed to load</p>
            <p className="text-slate-400 text-sm">{mapError}</p>
          </div>
        </div>
      )}

      {/* Approval Drawer */}
      {batchDrawerOpen && (
        <div className="fixed inset-0 z-[70] flex">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBatchDrawerOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="absolute right-0 top-0 h-full w-[420px] bg-gradient-to-br from-slate-900 to-slate-950 border-l border-slate-700/70 shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out]">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <div>
                <h3 className="font-bold text-lg text-orange-400">
                  New Fire Events ({batchDrawerPoints.length})
                </h3>
                <p className="text-xs text-slate-400 mt-1">Recently batch-published fire events</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white text-2xl p-1"
                onClick={() => setBatchDrawerOpen(false)}
                aria-label="Close drawer"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(() => {
                // Group by region
                const grouped: Record<string, FirePoint[]> = {}
                batchDrawerPoints.forEach(p => {
                  const region = p.region || p.locationName || 'Unknown'
                  if (!grouped[region]) grouped[region] = []
                  grouped[region].push(p)
                })
                return Object.entries(grouped).map(([region, points]) => (
                  <div key={region} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                    <div className="text-sm font-semibold text-slate-200 mb-2 flex items-center justify-between">
                      <span>{region}</span>
                      <span className="text-xs text-slate-400">{points.length} event{points.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-1.5">
                      {points.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-900 transition-colors"
                          onClick={() => {
                            if (mapInstance.current) {
                              mapInstance.current.flyTo({
                                center: [p.longitude, p.latitude],
                                zoom: 8,
                                duration: 1500
                              })
                            }
                            setBatchDrawerOpen(false)
                          }}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            p.level === 'HIGH' ? 'bg-red-500' :
                            p.level === 'MEDIUM' ? 'bg-orange-500' : 'bg-yellow-500'
                          }`} />
                          <span className="font-mono">
                            {p.latitude?.toFixed(2)}°, {p.longitude?.toFixed(2)}°
                          </span>
                          <span className="ml-auto text-orange-300">{p.level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
            <div className="p-4 border-t border-slate-700/50">
              <button
                type="button"
                className="w-full bg-slate-700/80 hover:bg-slate-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-all border border-slate-600"
                onClick={() => setBatchDrawerOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

          {/* High-Risk Zone Approval Drawer */}
          {batchZoneDrawerOpen && (
        <div className="fixed inset-0 z-[70] flex">
          {/* Background Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBatchZoneDrawerOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="absolute right-0 top-0 h-full w-[420px] bg-gradient-to-br from-slate-900 to-slate-950 border-l border-slate-700/70 shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out]">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <div>
                <h3 className="font-bold text-lg text-orange-400">
                  New High-Risk Zones ({batchDrawerZones.length})
                </h3>
                <p className="text-xs text-slate-400 mt-1">Recently batch-published high-risk zones</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white text-2xl p-1"
                onClick={() => setBatchZoneDrawerOpen(false)}
                aria-label="Close drawer"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {batchDrawerZones.map((zone) => {
                const riskColorClass = zone.riskLevel === 'HIGH' 
                  ? 'bg-red-500' 
                  : zone.riskLevel === 'MEDIUM' ? 'bg-orange-500' : 'bg-yellow-500'
                return (
                  <div
                    key={zone.zoneId}
                    className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                    onClick={() => {
                      if (mapInstance.current && mapboxRef.current) {
                        const sw = [zone.minLongitude, zone.minLatitude] as [number, number]
                        const ne = [zone.maxLongitude, zone.maxLatitude] as [number, number]
                        if (sw.every(Number.isFinite) && ne.every(Number.isFinite)) {
                          const bounds = new mapboxRef.current.LngLatBounds(sw, ne)
                          mapInstance.current.fitBounds(bounds, {
                            padding: 80,
                            maxZoom: 12,
                            pitch: 30,
                            bearing: 0,
                            duration: 2500
                          })
                        }
                      }
                      setBatchZoneDrawerOpen(false)
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-200">{zone.name || 'Unnamed Zone'}</span>
                      <span className={`inline-block w-2 h-2 rounded-full ${riskColorClass}`} />
                    </div>
                    <div className="text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">{zone.riskLevel || 'MEDIUM'}</span>
                      {' • '}
                      <span>{zone.historicalIncidents || 0} incidents</span>
                      {zone.approvedBy && (
                        <>
                          {' • '}
                          <span>By: {zone.approvedBy}</span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-4 border-t border-slate-700/50">
              <button
                type="button"
                className="w-full bg-slate-700/80 hover:bg-slate-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-all border border-slate-600"
                onClick={() => setBatchZoneDrawerOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {searchOpen ? (
        <div className="absolute top-[140px] right-6 z-40 p-4 bg-slate-900/90 border border-slate-700/70 rounded-3xl shadow-2xl backdrop-blur-xl w-[300px] max-h-[calc(100vh-200px)] flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="text-slate-300 text-xs uppercase tracking-[0.28em]">Search location</div>
            <button
              type="button"
              className="text-slate-400 hover:text-white transition text-lg"
              onClick={() => setSearchOpen(false)}
              aria-label="Close search panel"
            >
              ←
            </button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              performSearch()
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter place or city"
              className="flex-1 bg-slate-950/70 border border-slate-700 rounded-2xl px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {searching ? 'Searching…' : 'Go'}
            </button>
          </form>
          {searchError ? (
            <p className="text-[11px] text-rose-400 mt-2">{searchError}</p>
          ) : (
            <p className="text-[11px] text-slate-500 mt-2">Search and fly the map to a location.</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="absolute top-[140px] right-6 z-40 rounded-full bg-slate-900/90 border border-slate-700/70 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur-xl hover:bg-slate-800 transition"
        >
          Search
        </button>
      )}

      {layersOpen ? (
        <div className="absolute top-[320px] right-6 z-40 p-4 bg-slate-900/90 border border-slate-700/70 rounded-3xl shadow-2xl backdrop-blur-xl w-[300px] max-h-[calc(100vh-390px)] flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="text-slate-300 text-xs uppercase tracking-[0.28em]">Base Layers</div>
            <div className="flex items-center gap-2">
              {lastSync && (
                <span className="text-[10px] text-emerald-400 font-mono">Synced {lastSync}</span>
              )}
              <button
                type="button"
                className="text-slate-400 hover:text-white transition text-lg ml-2"
                onClick={() => setLayersOpen(false)}
                aria-label="Close layers panel"
              >
                ←
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(MAP_STYLES) as [MapStyleKey, (typeof MAP_STYLES)[MapStyleKey]][]).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveStyle(key)}
                className={`flex-1 min-w-[80px] rounded-2xl px-3 py-2 text-sm font-medium transition ${
                  activeStyle === key
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                    : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-700/60">
            <div className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">Visualization</div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500" />
              Heatmap + particle plume
              <span className="ml-auto text-slate-500">{firePoints.length} fires</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded border-2 border-red-500/60 bg-red-500/20" />
                <span className="text-xs text-slate-300">High Risk Zones</span>
              </div>
              <button
                type="button"
                onClick={() => setShowZones(!showZones)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  showZones ? 'bg-red-500/80' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    showZones ? 'translate-x-5.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLayersOpen(true)}
          className="absolute top-[320px] right-6 z-40 rounded-full bg-slate-900/90 border border-slate-700/70 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur-xl hover:bg-slate-800 transition"
        >
          Layers
        </button>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-700/60 text-xs text-slate-400 backdrop-blur-md pointer-events-none">
        WebGL 3D globe · drag to rotate · scroll to zoom · right-click to tilt
      </div>

      {showHUD && (
        <>
          <div className="hud-crosshair" style={{ animation: 'hudCrosshair 3s ease-out forwards' }} />
          <div className="hud-brackets" style={{ animation: 'hudBrackets 2s ease-in-out forwards' }} />
        </>
      )}

      {selectedPoint && detailsPosition && (
        <div
          className="absolute z-50 glass-card p-5 pt-8 rounded-2xl w-[300px] max-h-[420px] overflow-y-auto shadow-2xl"
          style={{ left: detailsPosition.left, top: detailsPosition.top }}
        >
          <button
            type="button"
            onClick={() => handleSelectPoint(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-full p-1 transition-colors"
            aria-label="Close fire point details"
          >
            ✕
          </button>
          <ul className="space-y-2.5 text-xs">
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Coordinates</span>
              <span className="text-slate-200 font-mono">
                {selectedPoint.latitude?.toFixed(4)}°, {selectedPoint.longitude?.toFixed(4)}°
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Region</span>
              <span className="text-slate-200">{formatRegion(selectedPoint.region)}</span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Satellite</span>
              <span className="text-slate-200">{formatSatelliteType(selectedPoint.satelliteType)}</span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Risk Level</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  selectedPoint.level === 'HIGH'
                    ? 'bg-red-500/30 text-red-200 border border-red-400/50'
                    : selectedPoint.level === 'MEDIUM'
                      ? 'bg-orange-500/30 text-orange-200 border border-orange-400/50'
                      : 'bg-yellow-500/30 text-yellow-200 border border-yellow-400/50'
                }`}
              >
                {selectedPoint.level}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Confidence</span>
              {(() => {

                const formatted = formatConfidence(selectedPoint.confidence)
                const colorClass = formatted.level
                  ? CONFIDENCE_LEVEL_COLOR[formatted.level]
                  : 'text-slate-200'
                const icon = formatted.level
                  ? CONFIDENCE_LEVEL_ICON[formatted.level]
                  : ''
                return (
                  <span
                    className={`font-mono flex items-center gap-1.5 ${colorClass}`}
                    title={formatted.isValid ? `Confidence: ${formatted.display}` : 'No confidence data'}
                  >
                    {icon && <span className="text-base leading-none">{icon}</span>}
                    <span>{formatted.display}</span>
                  </span>
                )
              })()}
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Brightness(TI4/TI5)</span>
              <span className="text-green-400 font-mono">{selectedPoint.brightness ?? 'N/A'} K / {selectedPoint.brightness_2 ?? 'N/A'} K</span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Radiation</span>
              <span className="text-green-400 font-mono font-bold telemetry-glow">{selectedPoint.frp ?? 'N/A'} MW</span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Scan/Track</span>
              <span className="text-slate-200 font-mono">{selectedPoint.scan ?? 'N/A'}/{selectedPoint.track ?? 'N/A'}</span>
            </li>
            <li className="flex gap-3">
              <span className="text-slate-400 min-w-32">Detected</span>
              <span className="text-slate-300 font-mono">{selectedPoint.acq_datetime || 'N/A'}</span>
            </li>
            {selectedPoint.sourceCount && selectedPoint.sourceCount > 1 && (
              <li className="flex gap-3">
                <span className="text-slate-400 min-w-32">Reports</span>
                <span className="text-blue-400 font-mono">{selectedPoint.sourceCount} satellites</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
