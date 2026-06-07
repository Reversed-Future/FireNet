// Unified Platform Domain Types

export type LogType = 'LOGIN' | 'OPERATION' | 'SYSTEM'
export type LogStatus = 'SUCCESS' | 'ERROR' | 'WARNING' | 'INFO' | 'PENDING' | 'REJECTED'
export type UserRole = 'user' | 'admin'
export type RiskLevel = 'LOW_RISK' | 'HIGH_RISK'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// User related types
export interface User {
  id: number
  username: string
  role: UserRole
  approvalStatus?: ApprovalStatus
  approvedBy?: string
  approvedAt?: Date
  approvedComment?: string
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
}

export interface SystemLog {
  id?: number
  logType: LogType
  operator: string
  action: string
  status: LogStatus
  target?: string
  details?: Record<string, unknown>
  createdAt: Date
}

export interface HighRiskZone {
  id?: number
  zoneId: string
  name: string
  description?: string
  minLatitude?: number
  maxLatitude?: number
  minLongitude?: number
  maxLongitude?: number
  polygonCoords?: string
  centerLatitude?: number
  centerLongitude?: number
  radiusKm?: number
  riskLevel: string
  historicalIncidents: number
  approvalStatus?: string
  approvedBy?: string
  approvedAt?: Date
  approvedComment?: string
  createdBy?: string
  createdAt: Date
  updatedAt: Date
  lastSeenAt?: Date
  isActive?: boolean
}
