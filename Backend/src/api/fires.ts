import { Router, type Request, type Response } from 'express'
import { pool } from '../db/pool.js'
import {
  getFireEvent,
  getFireStats,
  getNearbyFireEvents,
  listFireEventsWithSources,
  listFireEventsWithReviewStatus,
  toFirePoint,
  updateFireEventReview,
} from '../repositories/fireRepository.js'
import { runBulkIngest } from '../ingestion/bulkIngest.js'
import { config } from '../config.js'
import { authenticateToken, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { notificationServer } from '../websocket/notificationServer.js'

interface HighRiskZone {
  zone_id: string
  name: string
  description: string | null
  min_latitude: number
  max_latitude: number
  min_longitude: number
  max_longitude: number
  polygon_coords: string | null
  risk_level: string
  historical_incidents: number
  created_at: Date
}

export const firesRouter = Router()

firesRouter.get('/', async (req, res, next) => {
  try {
    const limit = clampInteger(req.query.limit, 100, 1, 1000)
    const offset = clampInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER)
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined
    const bbox = parseBbox(req.query.bbox)
    const sinceHours = req.query.sinceHours !== undefined ? 
      clampInteger(req.query.sinceHours, undefined, 1, 30 * 24) : undefined
    const reviewStatus = req.query.reviewStatus as 'pending' | 'approved' | 'dismissed' | 'all' | undefined
    
    const result = await listFireEventsWithReviewStatus(pool, { 
      bbox, 
      limit, 
      offset,
      cursor, 
      sinceHours, 
      reviewStatus: reviewStatus === 'all' ? undefined : (reviewStatus || 'approved')
    })
    
    const points = result.rows.map((row) => ({
      ...toFirePoint(row),
      review_status: row.review_status,
      published: row.published,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
    }))
    
    const hasMore = points.length === limit
    const nextCursor = hasMore && points.length > 0 ? Number(points[points.length - 1].id) : null
    
    res.json({
      code: 0,
      message: 'success',
      updatedAt: new Date().toISOString(),
      total: result.total,
      limit,
      offset,
      cursor,
      nextCursor,
      hasMore,
      points,
      data: points,
    })
  } catch (error) {
    next(error)
  }
})

firesRouter.get('/stats', async (_req, res, next) => {
  try {
    const stats = await getFireStats(pool)
    res.json({
      code: 0,
      message: 'success',
      total: stats.total,
      latestId: stats.latestId,
    })
  } catch (error) {
    next(error)
  }
})

firesRouter.get('/zones', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT zone_id, name, description, 
              min_latitude, max_latitude, min_longitude, max_longitude,
              polygon_coords, risk_level, historical_incidents, created_at
       FROM high_risk_zones 
       WHERE approval_status = 'approved'
       ORDER BY created_at DESC`
    )

    const zones = result.rows.map((row: any) => ({
      zoneId: row.zone_id,
      name: row.name,
      description: row.description || '',
      minLatitude: row.min_latitude,
      maxLatitude: row.max_latitude,
      minLongitude: row.min_longitude,
      maxLongitude: row.max_longitude,
      polygonCoords: row.polygon_coords,
      riskLevel: row.risk_level,
      historicalIncidents: row.historical_incidents,
      createdAt: row.created_at
    }))

    res.json({
      code: 0,
      message: 'success',
      data: zones,
      total: zones.length
    })
  } catch (error) {
    console.error('[API] Failed to fetch high risk zones:', error)
    next(error)
  }
})

firesRouter.get('/:fireId', async (req, res, next) => {
  try {
    const fireId = Number.parseInt(req.params.fireId, 10)
    if (!Number.isFinite(fireId)) {
      res.status(422).json({ code: 422, message: 'fire id must be numeric', data: null })
      return
    }

    const event = await getFireEvent(pool, fireId)
    if (!event) {
      res.status(404).json({ code: 404, message: 'fire event not found', data: null })
      return
    }

    const nearbyEvents = await getNearbyFireEvents(pool, event, 1000)

    res.json({
      code: 0,
      message: 'success',
      data: toFirePoint(event),
      detectedSource: event.source,
      nearbySources: nearbyEvents.map((e) => ({
        id: e.id,
        source: e.source,
        region: e.region,
        satelliteType: e.satellite_type,
        latitude: e.latitude,
        longitude: e.longitude,
        confidence: e.confidence,
        acqDate: e.acq_date,
        acqTime: e.acq_time,
      })),
    })
  } catch (error) {
    next(error)
  }
})

firesRouter.post('/bulk-ingest', async (req, res, next) => {
  try {
    if (!config.firmsMapKey) {
      res.status(400).json({
        code: 400,
        message: 'FIRMS_MAP_KEY is not configured. Please set it in .env file.',
      })
      return
    }

    const dryRun = req.query.dryRun === 'true'
    const regions = req.query.regions ? String(req.query.regions).split(',') : undefined
    const satellites = req.query.satellites ? String(req.query.satellites).split(',') : undefined

    const result = await runBulkIngest({ dryRun, regions, satellites })

    res.json({
      code: 0,
      message: 'success',
      data: result,
    })
  } catch (error) {
    next(error)
  }
})

firesRouter.patch('/:fireId/review', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const fireId = Number.parseInt(req.params.fireId, 10)
    if (!Number.isFinite(fireId)) {
      res.status(422).json({ code: 422, message: 'fire id must be numeric', data: null })
      return
    }

    const { reviewStatus, published } = req.body as {
      reviewStatus?: 'pending' | 'approved' | 'dismissed'
      published?: boolean
    }

    if (!reviewStatus || !['pending', 'approved', 'dismissed'].includes(reviewStatus)) {
      res.status(400).json({
        code: 400,
        message: 'reviewStatus must be one of: pending, approved, dismissed',
        data: null,
      })
      return
    }

    const success = await updateFireEventReview(pool, fireId, {
      reviewStatus,
      published: published ?? (reviewStatus === 'approved'),
      approvedBy: req.user?.username,
    })

    if (!success) {
      res.status(404).json({ code: 404, message: 'fire event not found', data: null })
      return
    }

    notificationServer.broadcastFireEventReviewed(String(fireId))

    if (reviewStatus === 'approved') {
      const updatedPoint = await getFireEvent(pool, fireId)
      if (updatedPoint) {
        const conf = updatedPoint.confidence
        const confNum = typeof conf === 'number' ? conf : (typeof conf === 'string' && !isNaN(Number(conf)) ? Number(conf) : 50)
        const level = confNum >= 66 ? 'HIGH' : confNum >= 33 ? 'MEDIUM' : 'LOW'
        const point = {
          id: fireId,
          latitude: updatedPoint.latitude,
          longitude: updatedPoint.longitude,
          level,
          locationName: updatedPoint.region || 'Unknown Location'
        }
        console.log('[API] Broadcasting fireEventApproved:', point)
        notificationServer.broadcastFireEventApproved(point)
      }
    } else {
      notificationServer.broadcastFireEventsUpdated()
    }

    res.json({
      code: 0,
      message: 'success',
      data: { id: fireId, reviewStatus, published: published ?? (reviewStatus === 'approved') },
    })
  } catch (error) {
    next(error)
  }
})

function parseBbox(value: unknown): [number, number, number, number] | undefined {
  if (value === undefined) return undefined
  const parts = String(value).split(',').map((item) => Number(item.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw Object.assign(new Error('bbox must be minLon,minLat,maxLon,maxLat'), { statusCode: 422 })
  }
  const [minLon, minLat, maxLon, maxLat] = parts
  if (minLon >= maxLon || minLat >= maxLat) {
    throw Object.assign(new Error('bbox min values must be smaller than max values'), { statusCode: 422 })
  }
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) {
    throw Object.assign(new Error('bbox coordinate out of range'), { statusCode: 422 })
  }
  return [minLon, minLat, maxLon, maxLat]
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number
function clampInteger(value: unknown, fallback: undefined, min: number, max: number): number | undefined
function clampInteger(value: unknown, fallback: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}
