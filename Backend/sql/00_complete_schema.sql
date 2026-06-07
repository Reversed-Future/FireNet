-- Global Fire Detection Platform - Complete Database Schema
-- Run this script once to initialize the database

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Drop existing tables if they exist (for clean initialization)
DROP TABLE IF EXISTS fire_events CASCADE;
DROP TABLE IF EXISTS ingestion_runs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS user_tokens CASCADE;
DROP TABLE IF EXISTS system_logs CASCADE;
DROP TABLE IF EXISTS high_risk_zones CASCADE;
DROP VIEW IF EXISTS fire_quality_summary CASCADE;
DROP FUNCTION IF EXISTS query_fire_events_in_bbox CASCADE;
DROP FUNCTION IF EXISTS set_fire_events_updated_at CASCADE;

-- ============================================
-- 1. Ingestion Tracking Table
-- ============================================

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    fetched_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    notes JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================
-- 2. Fire Events Table
-- ============================================

CREATE TABLE IF NOT EXISTS fire_events (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    source_event_id VARCHAR(120) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    geom geometry(Point, 4326) NOT NULL,
    level VARCHAR(10) NOT NULL CHECK (level IN ('HIGH', 'MEDIUM', 'LOW')),
    intensity_value DOUBLE PRECISION NOT NULL CHECK (intensity_value >= 0),
    intensity_text VARCHAR(40) NOT NULL,
    confidence VARCHAR(40),
    confidence_raw TEXT,
    detected_at TIMESTAMPTZ NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    unique_key VARCHAR(255),
    wkt TEXT,
    brightness DOUBLE PRECISION,
    scan DOUBLE PRECISION,
    track DOUBLE PRECISION,
    acq_date TEXT,
    acq_time TEXT,
    acq_datetime TIMESTAMPTZ,
    brightness_2 DOUBLE PRECISION,
    frp DOUBLE PRECISION,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status VARCHAR(20) DEFAULT 'pending',
    published BOOLEAN DEFAULT false,
    region VARCHAR(255),
    satellite_type VARCHAR(80),
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_fire_events_source_event UNIQUE (source, source_event_id)
);

-- Fire events indexes
CREATE INDEX IF NOT EXISTS idx_fire_events_geom ON fire_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_fire_events_geography ON fire_events USING GIST (geography(geom));
CREATE INDEX IF NOT EXISTS idx_fire_events_detected_at ON fire_events (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fire_events_level ON fire_events (level);
CREATE INDEX IF NOT EXISTS idx_fire_events_source_detected ON fire_events (source, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fire_events_source ON fire_events(source);
CREATE INDEX IF NOT EXISTS idx_fire_events_review_status ON fire_events(review_status);
CREATE INDEX IF NOT EXISTS idx_fire_events_review_status_id ON fire_events(review_status, id DESC);

-- Fire events trigger
DROP TRIGGER IF EXISTS trg_fire_events_updated_at ON fire_events;
CREATE OR REPLACE FUNCTION set_fire_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fire_events_updated_at
BEFORE UPDATE ON fire_events
FOR EACH ROW
EXECUTE FUNCTION set_fire_events_updated_at();

-- ============================================
-- 3. Users Table
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    approval_status VARCHAR(20) DEFAULT 'pending',
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    approved_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- User session tokens
CREATE TABLE IF NOT EXISTS user_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(512) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- ============================================
-- 4. System Audit Logs
-- ============================================

CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL,
    operator VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    target VARCHAR(255),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_logs_operator ON system_logs(operator);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(log_type);

-- ============================================
-- 5. High Risk Zones
-- ============================================

CREATE TABLE IF NOT EXISTS high_risk_zones (
    id SERIAL PRIMARY KEY,
    zone_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    min_latitude DOUBLE PRECISION,
    max_latitude DOUBLE PRECISION,
    min_longitude DOUBLE PRECISION,
    max_longitude DOUBLE PRECISION,
    polygon_coords TEXT,
    -- Tracking fields for improved deduplication and activity monitoring
    center_latitude NUMERIC(10, 6),
    center_longitude NUMERIC(10, 6),
    radius_km NUMERIC(6, 2),
    last_seen_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    -- Core fields
    risk_level VARCHAR(50) NOT NULL DEFAULT 'medium',
    historical_incidents INTEGER DEFAULT 0,
    approval_status VARCHAR(20) DEFAULT 'approved',
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    approved_comment TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_high_risk_zones_approval_status ON high_risk_zones(approval_status);
CREATE INDEX IF NOT EXISTS idx_high_risk_zones_center ON high_risk_zones(center_latitude, center_longitude);
CREATE INDEX IF NOT EXISTS idx_high_risk_zones_last_seen ON high_risk_zones(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_high_risk_zones_is_active ON high_risk_zones(is_active);

-- ============================================
-- 6. Functions
-- ============================================

CREATE OR REPLACE FUNCTION query_fire_events_in_bbox(
    min_lon DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    max_count INTEGER DEFAULT 1000
)
RETURNS TABLE (
    id BIGINT,
    source VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    level VARCHAR,
    intensity_value DOUBLE PRECISION,
    detected_at TIMESTAMPTZ,
    location_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.source,
        f.latitude,
        f.longitude,
        f.level,
        f.intensity_value,
        f.detected_at,
        f.location_name
    FROM fire_events f
    WHERE ST_Intersects(
        f.geom,
        ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
    )
    ORDER BY f.detected_at DESC
    LIMIT max_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 7. Views
-- ============================================

CREATE OR REPLACE VIEW fire_quality_summary AS
SELECT
    count(*) AS total_events,
    count(*) FILTER (WHERE level = 'HIGH') AS high_events,
    count(*) FILTER (WHERE level = 'MEDIUM') AS medium_events,
    count(*) FILTER (WHERE level = 'LOW') AS low_events,
    min(detected_at) AS earliest_detected_at,
    max(detected_at) AS latest_detected_at,
    avg(CASE WHEN confidence ~ '^[0-9.]+$' THEN confidence::double precision ELSE NULL END) AS avg_confidence
FROM fire_events;

-- ============================================
-- 8. Seed Data (Default Admin User)
-- ============================================

-- Default admin user (password: admin123)
INSERT INTO users (username, password_hash, role, approval_status)
VALUES ('admin', '$2b$10$EdtbPn3Hdznbd6XBMrB/2.9S3XnZ3lAqhlP/pHsLn6ZJqhNagCmPe', 'admin', 'approved')
ON CONFLICT (username) DO NOTHING;