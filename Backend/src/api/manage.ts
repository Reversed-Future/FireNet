import { Router, type Request, type Response } from 'express'
import { pool } from '../db/pool.js'
import { PlatformRepository } from '../repositories/platformRepository.js'
import { authenticateToken, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { syncHighRiskZones, calculateHighRiskZones } from '../services/highRiskZoneService.js'
import { notificationServer } from '../websocket/notificationServer.js'
import type { UserRole } from '../domain/platform.js'
import { createGzip, createGunzip } from 'zlib'
import { Readable, pipeline } from 'stream'
import { promisify } from 'util'

const pipelineAsync = promisify(pipeline)

export const manageRouter = Router()
const repo = new PlatformRepository(pool)

manageRouter.post('/regions/auto-calculate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const sinceHours = parseInt(req.body.sinceHours as string) || 168
    const { clusters, message } = await calculateHighRiskZones(sinceHours)
    // Transform clusters to zones format for API compatibility
    const zones = clusters.map(cluster => {
      const lats = cluster.points.map(p => p.latitude)
      const lons = cluster.points.map(p => p.longitude)
      return {
        zoneId: `preview_${cluster.centroid.lat.toFixed(2)}_${cluster.centroid.lon.toFixed(2)}`,
        name: `${cluster.riskLevel.toUpperCase()} Risk Zone (${cluster.density} fires)`,
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
        centerLat: cluster.centroid.lat,
        centerLon: cluster.centroid.lon,
        radiusKm: cluster.radiusKm,
        riskLevel: cluster.riskLevel,
        incidentCount: cluster.density
      }
    })
    res.json({
      code: 0,
      message: 'success',
      data: { zones, message }
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/regions/sync', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const sinceHours = parseInt(req.body.sinceHours as string) || 168
    const result = await syncHighRiskZones(sinceHours)
    res.json({
      code: 0,
      message: 'success',
      data: result
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/users/register', async (req: Request, res: Response, next) => {
  try {
    const { username, password, role } = req.body

    if (!username || !password || !role) {
      return res.status(400).json({
        code: 400,
        message: 'Registration parameters are incomplete! Please provide username, password, and role.'
      })
    }

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid role! Must be either admin or user'
      })
    }

    const existingUser = await repo.findUserByUsername(username)
    if (existingUser) {
      return res.status(409).json({
        code: 409,
        message: 'Username already registered'
      })
    }

    const newUser = await repo.createUser({
      username,
      password,
      role: role as UserRole
    })

    if (!newUser) {
      return res.status(500).json({
        code: 500,
        message: 'User registration failed'
      })
    }

    await repo.createLog({
      logType: 'OPERATION',
      operator: username,
      action: 'Register User',
      status: 'SUCCESS',
      target: 'User',
      details: { username, role }
    })

    res.json({
      code: 0,
      message: 'success',
      data: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.createdAt.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.get('/users', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const users = await repo.getAllUsers()
    res.json({
      code: 0,
      message: 'success',
      data: users.map(u => ({
        id: u.id,
        uid: String(u.id),
        username: u.username,
        role: u.role,
        approvalStatus: u.approvalStatus,
        lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never Active',
        createdAt: u.createdAt.toISOString()
      }))
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.get('/users/pending', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const users = await repo.getPendingUsers()
    res.json({
      code: 0,
      message: 'success',
      data: users.map(u => ({
        id: u.id,
        uid: String(u.id),
        username: u.username,
        role: u.role,
        createdAt: u.createdAt.toISOString()
      }))
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/users/:username/approve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const username = req.params.username
    const { comment } = req.body
    const approvedBy = req.user?.username || 'admin'
    const approved = await repo.approveUser(username, approvedBy, comment)
    if (!approved) {
      return res.status(404).json({
        code: 404,
        message: 'User does not exist or has already been approved'
      })
    }
    await repo.createLog({
      logType: 'OPERATION',
      operator: approvedBy,
      action: 'Approve User',
      status: 'SUCCESS',
      target: 'User',
      details: { username }
    })
    res.json({
      code: 0,
      message: 'success',
      data: `User ${username} approved successfully`
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/users/:username/reject', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const username = req.params.username
    const { comment } = req.body
    const rejectedBy = req.user?.username || 'admin'
    const rejected = await repo.rejectUser(username, rejectedBy, comment)
    if (!rejected) {
      return res.status(404).json({
        code: 404,
        message: 'User does not exist'
      })
    }
    await repo.createLog({
      logType: 'OPERATION',
      operator: rejectedBy,
      action: 'Reject User',
      status: 'REJECTED',
      target: 'User',
      details: { username }
    })
    res.json({
      code: 0,
      message: 'success',
      data: `User ${username} has been rejected and deleted`
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.delete('/users/:username', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const username = req.params.username
    const deleted = await repo.deleteUser(username)

    if (!deleted) {
      return res.status(404).json({
        code: 404,
        message: 'User does not exist'
      })
    }

    const operator = req.user?.username || 'unknown'
    await repo.createLog({
      logType: 'OPERATION',
      operator,
      action: 'Delete User',
      status: 'SUCCESS',
      target: 'User',
      details: { username }
    })

    res.json({
      code: 0,
      message: 'success',
      data: 'User deleted successfully'
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.get('/zones', async (req: Request, res: Response, next) => {
  try {
    const zones = await repo.getAllZones()
    res.json({
      code: 0,
      message: 'success',
      data: zones.map(z => ({
        id: z.zoneId,
        zoneId: z.zoneId,
        name: z.name,
        description: z.description,
        latitude: z.centerLatitude,
        longitude: z.centerLongitude,
        riskLevel: z.riskLevel,
        historicalIncidents: z.historicalIncidents,
        createdBy: z.createdBy,
        approvalStatus: z.approvalStatus,
        isActive: z.isActive,
        lastSeenAt: z.lastSeenAt?.toISOString(),
        createdAt: z.createdAt.toISOString(),
        updatedAt: z.updatedAt.toISOString()
      }))
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.get('/zones/pending', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const zones = await repo.getPendingZones()
    res.json({
      code: 0,
      message: 'success',
      data: zones.map(z => ({
        id: z.zoneId,
        zoneId: z.zoneId,
        name: z.name,
        description: z.description,
        latitude: z.centerLatitude,
        longitude: z.centerLongitude,
        riskLevel: z.riskLevel,
        historicalIncidents: z.historicalIncidents,
        createdBy: z.createdBy,
        approvalStatus: z.approvalStatus,
        isActive: z.isActive,
        lastSeenAt: z.lastSeenAt?.toISOString(),
        createdAt: z.createdAt.toISOString(),
        updatedAt: z.updatedAt.toISOString()
      }))
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/zones', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { zoneId, name, description, minLatitude, maxLatitude, minLongitude, maxLongitude, polygonCoords, riskLevel, historicalIncidents } = req.body
    const operator = req.user?.username || 'system'

    const newZone = await repo.createZone({
      zoneId,
      name,
      description,
      minLatitude,
      maxLatitude,
      minLongitude,
      maxLongitude,
      polygonCoords,
      riskLevel: riskLevel || 'medium',
      historicalIncidents: historicalIncidents || 0,
      createdBy: operator
    })

    res.json({
      code: 0,
      message: 'success',
      data: {
        ...newZone,
        createdAt: newZone.createdAt.toISOString(),
        updatedAt: newZone.updatedAt.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/zones/:zoneId/approve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const zoneId = req.params.zoneId
    const approvedBy = req.user?.username || 'admin'
    const approvedZone = await repo.approveZone(zoneId, approvedBy)
    if (!approvedZone) {
      return res.status(404).json({
        code: 404,
        message: 'Zone not found or already approved'
      })
    }
    await repo.createLog({
      logType: 'OPERATION',
      operator: approvedBy,
      action: 'Approve Zone',
      status: 'SUCCESS',
      target: 'HighRiskZone',
      details: { zoneId }
    })
    // 广播 zone 批准通知给前台地图
    try {
      notificationServer.broadcastZoneApproved({
        zoneId: approvedZone.zoneId,
        name: approvedZone.name,
        description: approvedZone.description,
        minLatitude: approvedZone.minLatitude,
        maxLatitude: approvedZone.maxLatitude,
        minLongitude: approvedZone.minLongitude,
        maxLongitude: approvedZone.maxLongitude,
        polygonCoords: approvedZone.polygonCoords,
        riskLevel: approvedZone.riskLevel,
        historicalIncidents: approvedZone.historicalIncidents,
        approvedBy,
        approvedAt: new Date().toISOString()
      })
    } catch (broadcastError) {
      console.error('[API] Failed to broadcast zone approval:', broadcastError)
    }
    res.json({
      code: 0,
      message: 'success',
      data: `Zone ${zoneId} approved`
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.post('/zones/:zoneId/reject', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const zoneId = req.params.zoneId
    const rejected = await repo.rejectZone(zoneId)
    if (!rejected) {
      return res.status(404).json({
        code: 404,
        message: 'Zone not found'
      })
    }
    await repo.createLog({
      logType: 'OPERATION',
      operator: req.user?.username || 'admin',
      action: 'Reject Zone',
      status: 'REJECTED',
      target: 'HighRiskZone',
      details: { zoneId }
    })
    res.json({
      code: 0,
      message: 'success',
      data: `Zone ${zoneId} rejected`
    })
  } catch (error) {
    next(error)
  }
})

manageRouter.delete('/zones/:zoneId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const deleted = await repo.deleteZone(req.params.zoneId)
    if (!deleted) {
      return res.status(404).json({ code: 404, message: 'Zone not found.' })
    }
    res.json({
      code: 0,
      message: 'success'
    })
  } catch (error) {
    next(error)
  }
})

// ================================
// Backup/Restore APIs
// ================================

const TABLES = [
  { name: 'ingestion_runs', sequence: 'ingestion_runs_id_seq' },
  { name: 'fire_events', sequence: 'fire_events_id_seq' },
  { name: 'users', sequence: 'users_id_seq' },
  { name: 'user_tokens', sequence: 'user_tokens_id_seq' },
  { name: 'system_logs', sequence: 'system_logs_id_seq' },
  { name: 'high_risk_zones', sequence: 'high_risk_zones_id_seq' }
]

manageRouter.get('/export', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  const client = await pool.connect()
  try {
    const exportData: Record<string, any[]> = {}
    for (const table of TABLES) {
      const result = await client.query(`SELECT * FROM ${table.name} ORDER BY id`)
      exportData[table.name] = result.rows.map(row => {
        const cloned = { ...row }
        for (const key of Object.keys(cloned)) {
          if (cloned[key] instanceof Date) {
            cloned[key] = cloned[key].toISOString()
          }
        }
        return cloned
      })
    }

    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: exportData
    }

    const jsonString = JSON.stringify(backupData)
    const filename = `fire-detection-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`
    
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Encoding', 'gzip')

    const inputStream = Readable.from([jsonString])
    const gzip = createGzip({ level: 9 })
    
    await pipelineAsync(inputStream, gzip, res)
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

manageRouter.post('/import', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { tables, version } = req.body

    if (!version || !tables) {
      return res.status(400).json({ code: 400, message: 'Invalid backup file format' })
    }

    // Clear tables before import
    for (const table of TABLES) {
      const tableName = table.name
      const data = tables[tableName]
      if (Array.isArray(data) && data.length > 0) {
        // Clear table data
        await client.query(`TRUNCATE TABLE ${tableName} CASCADE`)

        // Import data in batches
        const batchSize = 1000
        const columns = Object.keys(data[0])
        
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize)
          
          const valuesPlaceholders = batch.map((_, batchIndex) => 
            `(${columns.map((_, colIndex) => `$${batchIndex * columns.length + colIndex + 1}`).join(',')})`
          ).join(',')
          
          const values = batch.flatMap(row => 
            columns.map(col => {
              let val = row[col]
              if (val === null || val === undefined) return null
              if (col === 'geom') return val
              if (typeof val === 'object') return JSON.stringify(val)
              if (typeof val === 'string' && (col.endsWith('_at') || col.includes('datetime'))) {
                try { new Date(val); return val } catch { return null }
              }
              return val
            })
          )
          
          await client.query(
            `INSERT INTO ${tableName} (${columns.join(',')}) VALUES ${valuesPlaceholders}`,
            values
          )
        }

        // Reset sequence after import
        if (table.sequence) {
          const seqResult = await client.query(`SELECT max(id) FROM ${tableName}`)
          const maxId = seqResult.rows[0]?.max || 0
          await client.query(`SELECT setval('${table.sequence}', ${maxId + 1}, false)`)
        }
      }
    }

    await client.query('COMMIT')

    res.json({
      code: 0,
      message: 'success',
      data: { importedAt: new Date().toISOString() }
    })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})