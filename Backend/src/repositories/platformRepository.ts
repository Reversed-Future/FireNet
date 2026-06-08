import type { Pool, PoolClient } from 'pg'
import bcrypt from 'bcrypt'
import type {
  SystemLog, HighRiskZone, User,
  LogType, LogStatus, UserRole, ApprovalStatus
} from '../domain/platform.js'
import { notificationServer } from '../websocket/notificationServer.js'

const SALT_ROUNDS = 10

export class PlatformRepository {
  constructor(private pool: Pool) {}

  // ============================================
  // Authentication & User Management
  // ============================================

  async findUserByUsername(username: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT id, username, role, approval_status, created_at, updated_at, last_login_at FROM users WHERE username = $1',
      [username]
    )
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    }
  }

  async validateUserCredentials(username: string, password: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT id, username, password_hash, role, approval_status, created_at, updated_at, last_login_at FROM users WHERE username = $1',
      [username]
    )
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    const passwordMatch = await bcrypt.compare(password, row.password_hash)
    if (!passwordMatch) return null
    
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    }
  }

  async updateLastLogin(userId: number): Promise<void> {
    await this.pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    )
  }

  async createUser(user: { username: string; password: string; role: UserRole }): Promise<User | null> {
    const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS)
    const result = await this.pool.query(
      `INSERT INTO users (username, password_hash, role, approval_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, role, approval_status, created_at, updated_at, last_login_at`,
      [user.username, passwordHash, user.role]
    )
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    }
  }

  async getAllUsers(): Promise<User[]> {
    const result = await this.pool.query(
      'SELECT id, username, role, approval_status, created_at, updated_at, last_login_at FROM users ORDER BY created_at DESC'
    )
    return result.rows.map(row => ({
      id: row.id,
      username: row.username,
      role: row.role,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    }))
  }

  async approveUser(username: string, approvedBy: string, comment?: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users 
       SET approval_status = 'approved', approved_by = $2, approved_at = CURRENT_TIMESTAMP, approved_comment = $3
       WHERE username = $1 AND approval_status = 'pending'`,
      [username, approvedBy, comment || null]
    )
    return (result.rowCount ?? 0) > 0
  }

  async rejectUser(username: string, rejectedBy: string, comment?: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users 
       SET approval_status = 'rejected', approved_by = $2, approved_at = CURRENT_TIMESTAMP, approved_comment = $3
       WHERE username = $1`,
      [username, rejectedBy, comment || null]
    )
    if ((result.rowCount ?? 0) > 0) {
      await this.pool.query('DELETE FROM users WHERE username = $1', [username])
      return true
    }
    return false
  }

  async getPendingUsers(): Promise<User[]> {
    const result = await this.pool.query(
      `SELECT id, username, role, approval_status, created_at, updated_at, last_login_at 
       FROM users WHERE approval_status = 'pending' ORDER BY created_at DESC`
    )
    return result.rows.map(row => ({
      id: row.id,
      username: row.username,
      role: row.role,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    }))
  }

  async deleteUser(username: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM users WHERE username = $1',
      [username]
    )
    return (result.rowCount ?? 0) > 0
  }

  // ============================================
  // Audit Logs
  // ============================================

  async createLog(log: Omit<SystemLog, 'id' | 'createdAt'>): Promise<SystemLog> {
    const result = await this.pool.query(
      `INSERT INTO system_logs (log_type, operator, action, status, target, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [log.logType, log.operator, log.action, log.status, log.target || null, log.details ? JSON.stringify(log.details) : null]
    )
    const row = result.rows[0]
    const createdLog: SystemLog = { ...log, id: row.id, createdAt: row.created_at }
    
    notificationServer.broadcastLogAdded({
      id: String(createdLog.id),
      logType: createdLog.logType,
      operator: createdLog.operator,
      action: createdLog.action,
      status: createdLog.status,
      target: createdLog.target || '',
      details: typeof createdLog.details === 'object' ? JSON.stringify(createdLog.details) : (createdLog.details || ''),
      createdAt: createdLog.createdAt.toISOString ? createdLog.createdAt.toISOString() : String(createdLog.createdAt)
    })
    
    return createdLog
  }

  async getAllLogs(limit = 1000): Promise<SystemLog[]> {
    const result = await this.pool.query(
      'SELECT id, log_type, operator, action, status, target, details, created_at FROM system_logs ORDER BY created_at DESC LIMIT $1',
      [Number(limit)]
    )
    return result.rows.map(row => ({
      id: row.id,
      logType: row.log_type,
      operator: row.operator,
      action: row.action,
      status: row.status,
      target: row.target,
      details: row.details,
      createdAt: row.created_at
    }))
  }

  // ============================================
  // High Risk Zones
  // ============================================

  async getAllZones(): Promise<HighRiskZone[]> {
    const result = await this.pool.query(
      `SELECT id, zone_id, name, description,
              min_latitude, max_latitude, min_longitude, max_longitude, polygon_coords,
              center_latitude, center_longitude, radius_km,
              risk_level, historical_incidents, created_by, approval_status,
              created_at, updated_at, last_seen_at, is_active
       FROM high_risk_zones ORDER BY created_at DESC`
    )
    return result.rows.map(row => ({
      id: row.id,
      zoneId: row.zone_id,
      name: row.name,
      description: row.description,
      minLatitude: row.min_latitude,
      maxLatitude: row.max_latitude,
      minLongitude: row.min_longitude,
      maxLongitude: row.max_longitude,
      polygonCoords: row.polygon_coords,
      centerLatitude: row.center_latitude,
      centerLongitude: row.center_longitude,
      radiusKm: row.radius_km,
      riskLevel: row.risk_level,
      historicalIncidents: row.historical_incidents,
      createdBy: row.created_by,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      isActive: row.is_active
    }))
  }

  async getPendingZones(): Promise<HighRiskZone[]> {
    const result = await this.pool.query(
      `SELECT id, zone_id, name, description,
              min_latitude, max_latitude, min_longitude, max_longitude, polygon_coords,
              center_latitude, center_longitude, radius_km,
              risk_level, historical_incidents, created_by, approval_status,
              created_at, updated_at, last_seen_at, is_active
       FROM high_risk_zones
       WHERE approval_status = 'pending'
       ORDER BY created_at DESC`
    )
    return result.rows.map(row => ({
      id: row.id,
      zoneId: row.zone_id,
      name: row.name,
      description: row.description,
      minLatitude: row.min_latitude,
      maxLatitude: row.max_latitude,
      minLongitude: row.min_longitude,
      maxLongitude: row.max_longitude,
      polygonCoords: row.polygon_coords,
      centerLatitude: row.center_latitude,
      centerLongitude: row.center_longitude,
      radiusKm: row.radius_km,
      riskLevel: row.risk_level,
      historicalIncidents: row.historical_incidents,
      createdBy: row.created_by,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      isActive: row.is_active
    }))
  }

  async createZone(zone: { zoneId: string; name: string; description?: string; minLatitude?: number; maxLatitude?: number; minLongitude?: number; maxLongitude?: number; polygonCoords?: string; centerLatitude?: number; centerLongitude?: number; radiusKm?: number; riskLevel: string; historicalIncidents: number; createdBy?: string; approvalStatus?: ApprovalStatus }): Promise<HighRiskZone> {
    const result = await this.pool.query(
      `INSERT INTO high_risk_zones (zone_id, name, description,
        min_latitude, max_latitude, min_longitude, max_longitude, polygon_coords,
        center_latitude, center_longitude, radius_km,
        risk_level, historical_incidents, created_by, approval_status, last_seen_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), true)
       RETURNING id, zone_id, name, description,
                 min_latitude, max_latitude, min_longitude, max_longitude, polygon_coords,
                 center_latitude, center_longitude, radius_km,
                 risk_level, historical_incidents, created_by, approval_status, created_at, updated_at, last_seen_at, is_active`,
      [zone.zoneId, zone.name, zone.description || null,
       zone.minLatitude, zone.maxLatitude, zone.minLongitude, zone.maxLongitude, zone.polygonCoords || null,
       zone.centerLatitude || null, zone.centerLongitude || null, zone.radiusKm || null,
       zone.riskLevel, zone.historicalIncidents, zone.createdBy || 'system', zone.approvalStatus || 'pending']
    )
    const row = result.rows[0]
    return {
      id: row.id,
      zoneId: row.zone_id,
      name: row.name,
      description: row.description,
      minLatitude: row.min_latitude,
      maxLatitude: row.max_latitude,
      minLongitude: row.min_longitude,
      maxLongitude: row.max_longitude,
      polygonCoords: row.polygon_coords,
      centerLatitude: row.center_latitude,
      centerLongitude: row.center_longitude,
      radiusKm: row.radius_km,
      riskLevel: row.risk_level,
      historicalIncidents: row.historical_incidents,
      createdBy: row.created_by,
      approvalStatus: row.approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      isActive: row.is_active
    }
  }

  async approveZone(zoneId: string, approvedBy: string): Promise<HighRiskZone | null> {
    const result = await this.pool.query(
      `UPDATE high_risk_zones
       SET approval_status = 'approved', approved_by = $2, approved_at = CURRENT_TIMESTAMP
       WHERE zone_id = $1 AND approval_status = 'pending'
       RETURNING id, zone_id, name, description,
                 min_latitude, max_latitude, min_longitude, max_longitude,
                 polygon_coords, center_latitude, center_longitude, radius_km,
                 risk_level, historical_incidents, created_at, updated_at, last_seen_at, is_active`,
      [zoneId, approvedBy]
    )
    if ((result.rowCount ?? 0) === 0) return null
    const row = result.rows[0]
    return {
      id: row.id,
      zoneId: row.zone_id,
      name: row.name,
      description: row.description || '',
      minLatitude: row.min_latitude,
      maxLatitude: row.max_latitude,
      minLongitude: row.min_longitude,
      maxLongitude: row.max_longitude,
      polygonCoords: row.polygon_coords,
      centerLatitude: row.center_latitude,
      centerLongitude: row.center_longitude,
      radiusKm: row.radius_km,
      riskLevel: row.risk_level,
      historicalIncidents: row.historical_incidents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      isActive: row.is_active
    }
  }

  async rejectZone(zoneId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE high_risk_zones 
       SET approval_status = 'rejected'
       WHERE zone_id = $1`,
      [zoneId]
    )
    return (result.rowCount ?? 0) > 0
  }

  async deleteZone(zoneId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM high_risk_zones WHERE zone_id = $1',
      [zoneId]
    )
    return (result.rowCount ?? 0) > 0
  }

  // ============================================
  // Admin Regions
  // ============================================

  async getAdminRegions(): Promise<string[]> {
    return ['1', '2']
  }
}