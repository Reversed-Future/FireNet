import type { QueryResultRow } from 'pg';
import type { DbClient } from '../db/pool.js';
import type { FirePointResponse, NormalizedFireEvent } from '../domain/fire.js';

export interface FireEventRow extends QueryResultRow {
  id: string;
  source: string;
  source_event_id: string;
  latitude: number;
  longitude: number;
  confidence: string | null;
  region: string | null;
  satellite_type: string | null;
  unique_key: string | null;
  wkt: string | null;
  brightness: number | null;
  scan: number | null;
  track: number | null;
  acq_date: string | null;
  acq_time: string | null;
  acq_datetime: Date | null;
  brightness_2: number | null;
  frp: number | null;
}

export interface ListFireOptions {
  bbox?: [number, number, number, number];
  limit: number;
  offset: number;
  sinceHours?: number;
}

export async function listFireEvents(
  db: DbClient,
  options: ListFireOptions,
): Promise<{ total: number; rows: FireEventRow[] }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.bbox) {
    const [minLon, minLat, maxLon, maxLat] = options.bbox;
    params.push(minLon, minLat, maxLon, maxLat);
    where.push(
      `ST_Intersects(geom, ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326))`,
    );
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM fire_events ${whereSql}`,
    params,
  );

  params.push(options.limit, options.offset);
  const result = await db.query<FireEventRow>(
    `
    SELECT id::text, source, source_event_id, latitude, longitude,
           confidence, region, satellite_type, unique_key,
           wkt, brightness, scan, track,
           acq_date, acq_time, acq_datetime, brightness_2, frp
    FROM fire_events
    ${whereSql}
    ORDER BY id DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
    `,
    params,
  );

  return {
    total: Number(countResult.rows[0]?.count ?? 0),
    rows: result.rows,
  };
}

export async function getFireEvent(db: DbClient, id: number): Promise<FireEventRow | null> {
  const result = await db.query<FireEventRow>(
    `
    SELECT id::text, source, source_event_id, latitude, longitude,
           confidence, region, satellite_type, unique_key,
           wkt, brightness, scan, track,
           acq_date, acq_time, acq_datetime, brightness_2, frp
    FROM fire_events
    WHERE id = $1
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getNearbyFireEvents(
  db: DbClient,
  event: FireEventRow,
  distanceMeters = 1000,
): Promise<FireEventRow[]> {
  const result = await db.query<FireEventRow>(
    `
    SELECT id::text, source, source_event_id, latitude, longitude,
           confidence, region, satellite_type, unique_key,
           wkt, brightness, scan, track,
           acq_date, acq_time, acq_datetime, brightness_2, frp
    FROM fire_events
    WHERE id != $1
      AND ST_DWithin(
        geography(geom),
        geography(ST_SetSRID(ST_MakePoint($2, $3), 4326)),
        $4
      )
    ORDER BY id DESC
    `,
    [event.id, event.longitude, event.latitude, distanceMeters],
  );
  return result.rows;
}

export async function listFireEventsWithSources(
  db: DbClient,
  options: ListFireOptions,
): Promise<{
  total: number;
  rows: Array<FireEventRow & { sourceCount: number; otherSources: string[] }>;
}> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.bbox) {
    const [minLon, minLat, maxLon, maxLat] = options.bbox;
    params.push(minLon, minLat, maxLon, maxLat);
    where.push(
      `ST_Intersects(geom, ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326))`,
    );
  }

  if (options.sinceHours !== undefined) {
    params.push(options.sinceHours);
    where.push(`acq_datetime >= NOW() - $${params.length} * INTERVAL '1 hour'`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM fire_events ${whereSql}`,
    params,
  );

  params.push(options.limit, options.offset);
  const result = await db.query(
    `
    SELECT 
      fe.id::text,
      fe.source,
      fe.source_event_id,
      fe.latitude,
      fe.longitude,
      fe.confidence,
      fe.region,
      fe.satellite_type,
      fe.unique_key,
      fe.wkt,
      fe.brightness,
      fe.scan,
      fe.track,
      fe.acq_date,
      fe.acq_time,
      fe.acq_datetime,
      fe.brightness_2,
      fe.frp,
      (
        SELECT COUNT(DISTINCT source) 
        FROM fire_events fe2 
        WHERE ST_DWithin(geography(fe2.geom), geography(fe.geom), 1000)
      ) AS source_count,
      ARRAY(
        SELECT DISTINCT fe3.source 
        FROM fire_events fe3 
        WHERE fe3.id != fe.id 
          AND ST_DWithin(geography(fe3.geom), geography(fe.geom), 1000)
        ORDER BY fe3.source
      ) AS other_sources
    FROM fire_events fe
    ${whereSql}
    ORDER BY fe.id DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
    `,
    params,
  );

  return {
    total: Number(countResult.rows[0]?.count ?? 0),
    rows: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      source_event_id: row.source_event_id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      confidence: row.confidence,
      region: row.region,
      satellite_type: row.satellite_type,
      unique_key: row.unique_key,
      wkt: row.wkt,
      brightness: row.brightness,
      scan: row.scan,
      track: row.track,
      acq_date: row.acq_date,
      acq_time: row.acq_time,
      acq_datetime: row.acq_datetime,
      brightness_2: row.brightness_2,
      frp: row.frp,
      sourceCount: Number(row.source_count),
      otherSources: row.other_sources || [],
    })),
  };
}

export async function getFireStats(
  db: DbClient,
): Promise<{ total: number; latestId: number | null }> {
  const countResult = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM fire_events');
  const latestResult = await db.query<{ id: number | null }>(
    'SELECT max(id) AS id FROM fire_events',
  );

  return {
    total: Number(countResult.rows[0]?.count ?? 0),
    latestId: latestResult.rows[0]?.id ?? null,
  };
}

export async function upsertFireEvents(
  db: DbClient,
  records: NormalizedFireEvent[],
): Promise<{ insertedCount: number; updatedCount: number; skippedCount: number }> {
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    // Calculate level based on brightness or confidence
    const brightness = record.brightness || 0;
    let level = 'LOW';
    let intensityValue = 0;
    let intensityText = 'Low';

    if (brightness >= 340) {
      level = 'HIGH';
      intensityValue = brightness;
      intensityText = 'High Intensity Fire';
    } else if (brightness >= 320) {
      level = 'MEDIUM';
      intensityValue = brightness;
      intensityText = 'Medium Intensity Fire';
    } else {
      level = 'LOW';
      intensityValue = brightness;
      intensityText = 'Low Intensity Fire';
    }

    // Parse detected_at from acq_datetime or use current time
    const detectedAt = record.acqDatetime || new Date().toISOString();

    // Create location name from region
    const locationName = record.region || 'Unknown Location';

    // Check if record already exists
    let isNewRecord = false;
    if (record.uniqueKey) {
      const existingCheck = await db.query<{ id: string; satellite_type: string }>(
        'SELECT id::text, satellite_type FROM fire_events WHERE unique_key = $1',
        [record.uniqueKey],
      );

      if ((existingCheck.rowCount ?? 0) > 0) {
        const existingRecord = existingCheck.rows[0];

        // If existing is 24h data and new is 7d data, skip
        if (existingRecord.satellite_type && existingRecord.satellite_type.includes('_24hrs')) {
          if (record.satelliteType && record.satelliteType.includes('_7days')) {
            skippedCount++;
            continue;
          }
        }

        // Other cases - update
        updatedCount++;
      } else {
        insertedCount++;
        isNewRecord = true;
      }
    } else {
      // No uniqueKey, check by source + source_event_id
      const existing = await db.query<{ id: string }>(
        'SELECT id::text FROM fire_events WHERE source = $1 AND source_event_id = $2',
        [record.source, record.sourceEventId],
      );
      if (existing.rowCount === 0) {
        insertedCount++;
        isNewRecord = true;
      } else {
        updatedCount++;
      }
    }

    await db.query(
      `
      INSERT INTO fire_events (
        source, source_event_id, latitude, longitude, geom,
        level, intensity_value, intensity_text, confidence, confidence_raw,
        detected_at, location_name,
        region, satellite_type, unique_key,
        wkt, brightness, scan, track,
        acq_date, acq_time, acq_datetime, brightness_2, frp,
        raw_payload, updated_at
      )
      VALUES (
        $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326),
        $5, $6, $7, $8, $9,
        $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24::jsonb, now()
      )
      ON CONFLICT ON CONSTRAINT uq_fire_events_source_event DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        geom = EXCLUDED.geom,
        level = EXCLUDED.level,
        intensity_value = EXCLUDED.intensity_value,
        intensity_text = EXCLUDED.intensity_text,
        confidence = EXCLUDED.confidence,
        confidence_raw = EXCLUDED.confidence_raw,
        detected_at = EXCLUDED.detected_at,
        location_name = EXCLUDED.location_name,
        region = EXCLUDED.region,
        satellite_type = EXCLUDED.satellite_type,
        unique_key = EXCLUDED.unique_key,
        wkt = EXCLUDED.wkt,
        brightness = EXCLUDED.brightness,
        scan = EXCLUDED.scan,
        track = EXCLUDED.track,
        acq_date = EXCLUDED.acq_date,
        acq_time = EXCLUDED.acq_time,
        acq_datetime = EXCLUDED.acq_datetime,
        brightness_2 = EXCLUDED.brightness_2,
        frp = EXCLUDED.frp,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
      `,
      [
        record.source,
        record.sourceEventId,
        record.latitude,
        record.longitude,
        level,
        intensityValue,
        intensityText,
        record.confidence,
        record.confidenceRaw || null,
        detectedAt,
        locationName,
        record.region,
        record.satelliteType,
        record.uniqueKey,
        record.wkt,
        record.brightness,
        record.scan,
        record.track,
        record.acqDate,
        record.acqTime,
        record.acqDatetime,
        record.brightness2,
        record.frp,
        JSON.stringify(record.rawPayload),
      ],
    );
  }

  return { insertedCount, updatedCount, skippedCount };
}

export function toFirePoint(
  row: FireEventRow & { sourceCount?: number; otherSources?: string[] },
): FirePointResponse {
  return {
    id: row.id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    confidence: row.confidence,
    source: row.source,
    region: row.region,
    satelliteType: row.satellite_type,
    wkt: row.wkt,
    brightness: row.brightness,
    scan: row.scan,
    track: row.track,
    acqDate: row.acq_date,
    acqTime: row.acq_time,
    acqDatetime: row.acq_datetime ? formatDateTime(row.acq_datetime) : null,
    brightness2: row.brightness_2,
    brightness_2: row.brightness_2,
    frp: row.frp,
    sourceCount: row.sourceCount,
    otherSources: row.otherSources,
  };
}

function formatDateTime(value: Date): string {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export interface ReviewFireEventOptions {
  reviewStatus: 'pending' | 'approved' | 'dismissed';
  published: boolean;
  approvedBy?: string;
}

export async function updateFireEventReview(
  db: DbClient,
  id: number,
  options: ReviewFireEventOptions,
): Promise<boolean> {
  const result = await db.query(
    `
    UPDATE fire_events
    SET review_status = $2,
        published = $3,
        approved_by = $4,
        approved_at = CASE WHEN $3 = true THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [id, options.reviewStatus, options.published, options.approvedBy || null],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listFireEventsWithReviewStatus(
  db: DbClient,
  options: ListFireOptions & { reviewStatus?: 'pending' | 'approved' | 'dismissed' | 'all'; cursor?: number },
): Promise<{ total: number; rows: Array<FireEventRow & { sourceCount: number; otherSources: string[]; review_status: string; published: boolean; approved_by: string | null; approved_at: Date | null }> }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.bbox) {
    const [minLon, minLat, maxLon, maxLat] = options.bbox;
    params.push(minLon, minLat, maxLon, maxLat);
    where.push(
      `ST_Intersects(geom, ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326))`,
    );
  }

  if (options.sinceHours !== undefined) {
    params.push(options.sinceHours);
    where.push(`acq_datetime >= NOW() - $${params.length} * INTERVAL '1 hour'`);
  }

  if (options.reviewStatus && options.reviewStatus !== 'all') {
    params.push(options.reviewStatus);
    where.push(`fe.review_status = $${params.length}`);
  }

  if (options.cursor !== undefined) {
    params.push(options.cursor);
    where.push(`fe.id < $${params.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM fire_events fe ${whereSql}`,
    params,
  );

  params.push(options.limit);
  const result = await db.query(
    `
    SELECT 
      fe.id::text,
      fe.source,
      fe.source_event_id,
      fe.latitude,
      fe.longitude,
      fe.confidence,
      fe.region,
      fe.satellite_type,
      fe.unique_key,
      fe.wkt,
      fe.brightness,
      fe.scan,
      fe.track,
      fe.acq_date,
      fe.acq_time,
      fe.acq_datetime,
      fe.brightness_2,
      fe.frp,
      fe.review_status,
      fe.published,
      fe.approved_by,
      fe.approved_at,
      (
        SELECT COUNT(DISTINCT source) 
        FROM fire_events fe2 
        WHERE ST_DWithin(geography(fe2.geom), geography(fe.geom), 1000)
      ) AS source_count,
      ARRAY(
        SELECT DISTINCT fe3.source 
        FROM fire_events fe3 
        WHERE fe3.id != fe.id 
          AND ST_DWithin(geography(fe3.geom), geography(fe.geom), 1000)
        ORDER BY fe3.source
      ) AS other_sources
    FROM fire_events fe
    ${whereSql}
    ORDER BY fe.id DESC
    LIMIT $${params.length}
    `,
    params,
  );

  return {
    total: Number(countResult.rows[0]?.count ?? 0),
    rows: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      source_event_id: row.source_event_id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      confidence: row.confidence,
      region: row.region,
      satellite_type: row.satellite_type,
      unique_key: row.unique_key,
      wkt: row.wkt,
      brightness: row.brightness,
      scan: row.scan,
      track: row.track,
      acq_date: row.acq_date,
      acq_time: row.acq_time,
      acq_datetime: row.acq_datetime,
      brightness_2: row.brightness_2,
      frp: row.frp,
      sourceCount: Number(row.source_count),
      otherSources: row.other_sources || [],
      review_status: row.review_status,
      published: row.published,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
    })),
  };
}
