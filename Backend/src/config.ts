import dotenv from 'dotenv'

dotenv.config()

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) {
    return [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ]
  }

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }

  return []
}

export const config = {
  appName: process.env.APP_NAME ?? 'Firenet Data Backend',
  appEnv: process.env.APP_ENV ?? 'development',
  port: parseInteger(process.env.PORT, 8000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://firenet:firenet@localhost:5432/firenet',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  firmsMapKey: process.env.FIRMS_MAP_KEY ?? '',
  firmsWfsRegion: process.env.FIRMS_WFS_REGION ?? 'SouthEast_Asia',
  firmsWfsTypename: process.env.FIRMS_WFS_TYPENAME ?? 'ms:fires_snpp_24hrs',
  firmsWfsBbox: process.env.FIRMS_WFS_BBOX ?? '-90,-180,90,180',
  firmsWfsCount: parseInteger(process.env.FIRMS_WFS_COUNT, 1000),
  schedulerEnabled: parseBoolean(process.env.SCHEDULER_ENABLED, false),
  schedulerIntervalMinutes: parseInteger(process.env.SCHEDULER_INTERVAL_MINUTES, 60),
  jwtSecret: process.env.JWT_SECRET ?? 'global-fire-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
}