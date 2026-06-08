import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'


function calculateLevel(brightness: number, confidence: string | number | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (confidence === null || confidence === undefined) return 'LOW'
  const confStr = String(confidence).toLowerCase()
  
  if (brightness >= 340 || confStr === 'high' || confStr === 'h') {
    return 'HIGH'
  } else if (brightness >= 320 || confStr === 'nominal' || confStr === 'n') {
    return 'MEDIUM'
  } else {
    return 'LOW'
  }
}

function transformBackendPoint(point: any) {
  return {
    id: String(point.id),
    latitude: point.latitude,
    longitude: point.longitude,
    brightness: point.brightness,
    scan: point.scan,
    track: point.track,
    acq_date: point.acq_date,
    acq_time: String(point.acq_time),
    acq_datetime: point.acq_datetime || point.acqDatetime,
    acqDatetime: point.acqDatetime || point.acq_datetime,
    confidence: point.confidence,
    brightness_2: point.brightness_2 || point.brightness2,
    brightness2: point.brightness2 || point.brightness_2,
    frp: point.frp,
    region: point.region,
    satelliteType: point.satelliteType,
    uniqueKey: point.uniqueKey,
    source: point.source,
    sourceCount: point.sourceCount,
    otherSources: point.otherSources,
    level: calculateLevel(point.brightness, point.confidence),
    WKT: point.WKT || point.wkt || `POINT(${point.longitude} ${point.latitude})`,
    locationName: point.region || 'Unknown Location',
    review_status: point.review_status || 'pending',
    published: point.published || false,
    approved_by: point.approved_by || null,
    approved_at: point.approved_at || null
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') || '1000'
    const offset = searchParams.get('offset') || '0'
    const cursor = searchParams.get('cursor')
    const sinceHours = searchParams.get('sinceHours')
    const reviewStatus = searchParams.get('reviewStatus')
    
    console.log(`[Fire API] Request received: limit=${limit}, offset=${offset}, cursor=${cursor}, sinceHours=${sinceHours}, reviewStatus=${reviewStatus || 'all'}`)
    

    const url = new URL('http://localhost:8000/api/fires')
    url.searchParams.set('limit', limit)
    url.searchParams.set('offset', offset)
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    }
    if (sinceHours) {
      url.searchParams.set('sinceHours', sinceHours)
    }
    if (reviewStatus) {
      url.searchParams.set('reviewStatus', reviewStatus)
    }
    
    console.log(`[Fire API] Calling backend: ${url.toString()}`)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log(`[Fire API] Backend response status: ${response.status}`)
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`)
    }

    const result = await response.json()

    let data: any[] = []
    let total: number = 0
    let nextCursor: number | null = null
    let hasMore: boolean = false
    
    if (Array.isArray(result)) {
      data = result
      total = data.length
    } else if (result.points) {
      data = result.points
      total = result.total ?? data.length
      nextCursor = result.nextCursor ?? null
      hasMore = result.hasMore ?? false
    } else if (result.data) {
      data = result.data
      total = result.total ?? data.length
    }
    
    const points = data.map(transformBackendPoint)

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      points: points,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      cursor: cursor ? parseInt(cursor) : null,
      nextCursor,
      hasMore
    })
  } catch (error) {
    console.error('Failed to fetch fire points:', error)

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      points: [],
      total: 0,
      error: 'Failed to connect to backend'
    })
  }
}
