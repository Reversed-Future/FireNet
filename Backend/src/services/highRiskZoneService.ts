import { pool } from '../db/pool.js'
import { randomUUID } from 'crypto'

interface FirePoint {
  latitude: number
  longitude: number
  frp?: number
  brightness?: number
}

interface Cluster {
  centroid: { lat: number, lon: number }
  points: FirePoint[]
  density: number
  riskLevel: 'high' | 'medium' | 'low'
  radiusKm: number
}

interface ExistingZone {
  zoneId: string
  name: string
  centerLatitude: number | null
  centerLongitude: number | null
  radiusKm: number | null
  riskLevel: string
  incidentCount: number
  approvalStatus: string
  minLatitude: number | null
  maxLatitude: number | null
  minLongitude: number | null
  maxLongitude: number | null
}

interface ZoneMatch {
  zone: ExistingZone
  score: number
}

// ============================================
// Configuration
// ============================================

const CLUSTER_RADIUS_KM = 50
const HIGH_RISK_THRESHOLD = 10
const MEDIUM_RISK_THRESHOLD = 5
const OVERLAP_FACTOR = 0.6 // distance < (r1 + r2) * OVERLAP_FACTOR means overlap
const INACTIVE_THRESHOLD_DAYS = 14 // days since last_seen_at before zone is considered inactive

// ============================================
// Utility Functions
// ============================================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Generate a stable UUID for new zones
 * zoneId is completely decoupled from geographic calculations
 */
function generateZoneId(): string {
  return `zone_${randomUUID().slice(0, 8)}`
}

/**
 * Calculate the radius of a cluster based on the maximum distance from centroid
 */
function calculateClusterRadius(cluster: Cluster): number {
  if (cluster.points.length <= 1) return 5 // minimum radius

  let maxDistance = 0
  for (const point of cluster.points) {
    const distance = haversineDistance(
      cluster.centroid.lat, cluster.centroid.lon,
      point.latitude, point.longitude
    )
    maxDistance = Math.max(maxDistance, distance)
  }

  // Return at least 5km, at most CLUSTER_RADIUS_KM
  return Math.max(5, Math.min(maxDistance, CLUSTER_RADIUS_KM))
}

/**
 * Find the best matching zone for a cluster based on overlap detection
 * Uses center distance + radius comparison instead of bounding box overlap
 */
function findBestMatch(cluster: Cluster, existingZones: ExistingZone[]): ZoneMatch | null {
  const matches: ZoneMatch[] = []

  for (const zone of existingZones) {
    // Skip zones without center data
    if (zone.centerLatitude === null || zone.centerLongitude === null || zone.radiusKm === null) {
      continue
    }

    const distance = haversineDistance(
      zone.centerLatitude, zone.centerLongitude,
      cluster.centroid.lat, cluster.centroid.lon
    )

    const threshold = (zone.radiusKm + cluster.radiusKm) * OVERLAP_FACTOR

    if (distance < threshold) {
      // Score: higher is better, 1.0 = perfect match at center
      const score = 1 - (distance / threshold)
      matches.push({ zone, score })
    }
  }

  // Sort by score descending, return best match
  matches.sort((a, b) => b.score - a.score)
  return matches.length > 0 ? matches[0] : null
}

// ============================================
// Clustering Logic
// ============================================

function clusterFires(fires: FirePoint[], minDensity: number = MEDIUM_RISK_THRESHOLD): Cluster[] {
  const clusters: Cluster[] = []
  const clustered = new Set<number>()

  const sortedFires = [...fires].sort((a, b) =>
    (b.frp || 0) - (a.frp || 0)
  )

  for (let i = 0; i < sortedFires.length; i++) {
    if (clustered.has(i)) continue

    const clusterPoints: FirePoint[] = [sortedFires[i]]
    clustered.add(i)

    for (let j = 0; j < sortedFires.length; j++) {
      if (clustered.has(j)) continue

      const distance = haversineDistance(
        sortedFires[i].latitude, sortedFires[i].longitude,
        sortedFires[j].latitude, sortedFires[j].longitude
      )

      if (distance <= CLUSTER_RADIUS_KM) {
        clusterPoints.push(sortedFires[j])
        clustered.add(j)
      }
    }

    const centroidLat = clusterPoints.reduce((sum, p) => sum + p.latitude, 0) / clusterPoints.length
    const centroidLon = clusterPoints.reduce((sum, p) => sum + p.longitude, 0) / clusterPoints.length

    const riskLevel = clusterPoints.length >= HIGH_RISK_THRESHOLD ? 'high' :
                      clusterPoints.length >= MEDIUM_RISK_THRESHOLD ? 'medium' : 'low'

    // Create cluster with temporary radius, then calculate actual radius
    const tempCluster: Omit<Cluster, 'radiusKm'> = {
      centroid: { lat: centroidLat, lon: centroidLon },
      points: clusterPoints,
      density: clusterPoints.length,
      riskLevel
    }

    const radiusKm = calculateClusterRadius(tempCluster as Cluster)

    const cluster: Cluster = {
      ...tempCluster,
      radiusKm
    }

    clusters.push(cluster)
  }

  return clusters.filter(c => c.density >= minDensity)
}

// ============================================
// Main Functions
// ============================================

export async function calculateHighRiskZones(sinceHours: number = 168): Promise<{
  clusters: Cluster[]
  message: string
}> {
  try {
    const result = await pool.query(`
      SELECT latitude, longitude, frp, brightness
      FROM fire_events
      WHERE review_status = 'approved'
        AND acq_datetime >= NOW() - ($1 || ' hours')::interval
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
    `, [sinceHours])

    const fires: FirePoint[] = result.rows.map(row => ({
      latitude: row.latitude,
      longitude: row.longitude,
      frp: row.frp || 0,
      brightness: row.brightness || 0
    }))

    if (fires.length === 0) {
      return { clusters: [], message: 'No fire events found in the specified time range' }
    }

    const clusters = clusterFires(fires)
    const highMediumClusters = clusters.filter(c => c.riskLevel !== 'low')

    return {
      clusters: highMediumClusters,
      message: `Found ${highMediumClusters.length} high/medium risk zones from ${fires.length} fire events`
    }
  } catch (error) {
    console.error('[HighRiskZone] Failed to calculate zones:', error)
    throw error
  }
}

export async function syncHighRiskZones(sinceHours: number = 168): Promise<{
  added: number
  updated: number
  deactivated: number
}> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { clusters, message } = await calculateHighRiskZones(sinceHours)
    console.log('[HighRiskZone]', message)

    let added = 0
    let updated = 0
    let deactivated = 0

    // Get all existing zones with their tracking fields
    const existingZonesResult = await client.query(`
      SELECT
        zone_id, name, center_latitude, center_longitude, radius_km,
        risk_level, historical_incidents, approval_status,
        min_latitude, max_latitude, min_longitude, max_longitude
      FROM high_risk_zones
      WHERE is_active = true OR is_active IS NULL
    `)

    const existingZones: ExistingZone[] = existingZonesResult.rows.map(row => ({
      zoneId: row.zone_id,
      name: row.name,
      centerLatitude: row.center_latitude != null ? Number(row.center_latitude) : null,
      centerLongitude: row.center_longitude != null ? Number(row.center_longitude) : null,
      radiusKm: row.radius_km != null ? Number(row.radius_km) : null,
      riskLevel: row.risk_level,
      incidentCount: row.historical_incidents,
      approvalStatus: row.approval_status,
      minLatitude: row.min_latitude,
      maxLatitude: row.max_latitude,
      minLongitude: row.min_longitude,
      maxLongitude: row.max_longitude
    }))

    // Track which zones were matched in this sync
    const matchedZoneIds = new Set<string>()
    const now = new Date()

    // Process each cluster - prioritize matching to existing zones
    // Priority: 1. approved zones (confirmed), 2. pending zones (already tracked)
    // Within same priority: best match by overlap score
    const approvedZones = existingZones.filter(z => z.approvalStatus === 'approved')
    const pendingZones = existingZones.filter(z => z.approvalStatus === 'pending')

    console.log(`[HighRiskZone] Clusters: ${clusters.length}, Approved zones: ${approvedZones.length}, Pending zones: ${pendingZones.length}`)

    for (const cluster of clusters) {
      // First try to match an approved zone (shouldn't change approved zone location/name)
      let bestMatch = findBestMatch(cluster, approvedZones)

      // If no approved match, try pending zones
      if (!bestMatch) {
        bestMatch = findBestMatch(cluster, pendingZones)
      }

      if (bestMatch) {
        const zoneLat = bestMatch.zone.centerLatitude != null ? bestMatch.zone.centerLatitude.toFixed(4) : 'null'
        const zoneLon = bestMatch.zone.centerLongitude != null ? bestMatch.zone.centerLongitude.toFixed(4) : 'null'
        console.log(`[HighRiskZone] Match: cluster(${cluster.centroid.lat.toFixed(4)}, ${cluster.centroid.lon.toFixed(4)}) -> zone(${zoneLat}, ${zoneLon}) score=${bestMatch.score.toFixed(3)}`)
        // Update existing zone
        const zone = bestMatch.zone
        matchedZoneIds.add(zone.zoneId)

        const lats = cluster.points.map(p => p.latitude)
        const lons = cluster.points.map(p => p.longitude)
        const newMinLat = Math.min(...lats)
        const newMaxLat = Math.max(...lats)
        const newMinLon = Math.min(...lons)
        const newMaxLon = Math.max(...lons)

        if (zone.approvalStatus === 'approved') {
          // For approved zones: only update statistics, preserve human-reviewed fields
          await client.query(`
            UPDATE high_risk_zones
            SET
              historical_incidents = $1,
              risk_level = $2,
              center_latitude = $3,
              center_longitude = $4,
              radius_km = $5,
              last_seen_at = $6,
              updated_at = $6
            WHERE zone_id = $7
          `, [
            cluster.density,
            cluster.riskLevel,
            cluster.centroid.lat,
            cluster.centroid.lon,
            cluster.radiusKm,
            now,
            zone.zoneId
          ])
        } else {
          // For pending zones: update all fields including bounds
          await client.query(`
            UPDATE high_risk_zones
            SET
              name = $1,
              historical_incidents = $2,
              risk_level = $3,
              center_latitude = $4,
              center_longitude = $5,
              radius_km = $6,
              min_latitude = $7,
              max_latitude = $8,
              min_longitude = $9,
              max_longitude = $10,
              last_seen_at = $11,
              updated_at = $11
            WHERE zone_id = $12
          `, [
            `${cluster.riskLevel.toUpperCase()} Risk Zone (${cluster.density} fires)`,
            cluster.density,
            cluster.riskLevel,
            cluster.centroid.lat,
            cluster.centroid.lon,
            cluster.radiusKm,
            newMinLat,
            newMaxLat,
            newMinLon,
            newMaxLon,
            now,
            zone.zoneId
          ])
        }
        updated++
      } else {
        console.log(`[HighRiskZone] NO MATCH: cluster(${cluster.centroid.lat.toFixed(4)}, ${cluster.centroid.lon.toFixed(4)}) radius=${cluster.radiusKm.toFixed(2)}, creating new zone`)
        // Create new zone with UUID
        const zoneId = generateZoneId()
        const lats = cluster.points.map(p => p.latitude)
        const lons = cluster.points.map(p => p.longitude)

        await client.query(`
          INSERT INTO high_risk_zones (
            zone_id, name, description,
            min_latitude, max_latitude, min_longitude, max_longitude,
            center_latitude, center_longitude, radius_km,
            risk_level, historical_incidents, created_by, approval_status,
            created_at, updated_at, last_seen_at, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'system', 'pending', $13, $13, $13, true)
        `, [
          zoneId,
          `${cluster.riskLevel.toUpperCase()} Risk Zone (${cluster.density} fires)`,
          `Auto-generated high risk zone with ${cluster.density} fire incidents`,
          Math.min(...lats),
          Math.max(...lats),
          Math.min(...lons),
          Math.max(...lons),
          cluster.centroid.lat,
          cluster.centroid.lon,
          cluster.radiusKm,
          cluster.riskLevel,
          cluster.density,
          now
        ])
        added++
      }
    }

    // Deactivate zones that were not matched and exceed inactive threshold
    const inactiveThreshold = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)

    const toDeactivateResult = await client.query(`
      SELECT zone_id, approval_status
      FROM high_risk_zones
      WHERE (is_active = true OR is_active IS NULL)
        AND (last_seen_at IS NULL OR last_seen_at < $1)
    `, [inactiveThreshold])

    for (const row of toDeactivateResult.rows) {
      if (row.approval_status === 'pending') {
        // Delete pending zones that are inactive
        await client.query('DELETE FROM high_risk_zones WHERE zone_id = $1', [row.zone_id])
      } else {
        // Mark approved zones as inactive instead of deleting
        await client.query(`
          UPDATE high_risk_zones
          SET is_active = false, updated_at = $1
          WHERE zone_id = $2
        `, [now, row.zone_id])
      }
      deactivated++
    }

    await client.query('COMMIT')

    console.log(`[HighRiskZone] Sync complete: added=${added}, updated=${updated}, deactivated=${deactivated}`)
    return { added, updated, deactivated }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[HighRiskZone] Failed to sync zones:', error)
    throw error
  } finally {
    client.release()
  }
}
