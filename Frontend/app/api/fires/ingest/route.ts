import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPPORTED_REGIONS = [
  'Canada', 'Alaska', 'USA_contiguous_and_Hawaii', 'Central_America',
  'South_America', 'Europe', 'Northern_and_Central_Africa', 'Southern_Africa',
  'Russia_Asia', 'South_Asia', 'SouthEast_Asia', 'Australia_NewZealand'
]

const SUPPORTED_TYPENAMES = [
  'ms:fires_snpp_24hrs',
  'ms:fires_noaa20_24hrs',
  'ms:fires_noaa21_24hrs',
  'ms:fires_modis_24hrs',
  'ms:fires_snpp_7days',
  'ms:fires_noaa20_7days',
  'ms:fires_noaa21_7days',
  'ms:fires_modis_7days',
]

// Map frontend region values to backend supported regions
const regionMap: Record<string, string> = {
  'Canada': 'Canada',
  'Alaska': 'Alaska',
  'USA_contiguous_and_Hawaii': 'USA_contiguous_and_Hawaii',
  'Central_America': 'Central_America',
  'South_America': 'South_America',
  'Europe': 'Europe',
  'Northern_and_Central_Africa': 'Northern_and_Central_Africa',
  'Southern_Africa': 'Southern_Africa',
  'Russia_Asia': 'Russia_Asia',
  'South_Asia': 'South_Asia',
  'SouthEast_Asia': 'SouthEast_Asia',
  'Australia_NewZealand': 'Australia_NewZealand',
}

/**
 * 判断 count 是否表示"获取所有数据"（无限）
 * 支持的语义：空字符串 / 'all' / 'infinite' / 'infinity' / '0' / 0
 */
function isUnlimitedCount(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true
  const v = String(value).trim().toLowerCase()
  if (v === '' || v === 'all' || v === 'infinite' || v === 'infinity' || v === '0') return true
  return false
}

function parseCount(value: string | null | undefined, fallback: number): number {
  if (isUnlimitedCount(value)) return fallback
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawRegion = (searchParams.get('region') || '').trim()
    const rawTypename = (searchParams.get('typename') || '').trim()
    const rawCount = searchParams.get('count')

    // region: 'All' 或空 -> 拉取所有区域
    const isAllRegion = !rawRegion || rawRegion.toLowerCase() === 'all'
    // typename: 'all' 或空 -> 拉取所有卫星
    const isAllTypename = !rawTypename || rawTypename.toLowerCase() === 'all'
    // count: 留空 / 'all' / '0' -> 表示获取所有数据（走分页直到取完）
    const unlimitedCount = isUnlimitedCount(rawCount)

    // 校验：当不是 All 时，必须是受支持的 region / typename
    let mappedRegions: string[] | null = null
    if (!isAllRegion) {
      const mapped = regionMap[rawRegion]
      if (!mapped) {
        return NextResponse.json({
          success: false,
          message: `Unsupported region: ${rawRegion}. Supported regions: ${['All', ...SUPPORTED_REGIONS].join(', ')}`,
          fetchedCount: 0,
          insertedCount: 0,
        }, { status: 400 })
      }
      mappedRegions = [mapped]
    }

    let mappedTypenames: string[] | null = null
    if (!isAllTypename) {
      if (!SUPPORTED_TYPENAMES.includes(rawTypename)) {
        return NextResponse.json({
          success: false,
          message: `Unsupported typename: ${rawTypename}. Supported: ${['all', ...SUPPORTED_TYPENAMES].join(', ')}`,
          fetchedCount: 0,
          insertedCount: 0,
        }, { status: 400 })
      }
      mappedTypenames = [rawTypename]
    }

    // === 走 bulk 端点（一次性拉取所有匹配的区域/卫星数据） ===
    // 该路径适用于：All region / All typename / "unlimited" count 的任意组合
    if (isAllRegion || isAllTypename || unlimitedCount) {
      const url = new URL('http://localhost:8000/api/fires/bulk-ingest')
      if (mappedRegions) url.searchParams.set('regions', mappedRegions.join(','))
      if (mappedTypenames) url.searchParams.set('satellites', mappedTypenames.join(','))

      console.log(`[Ingest API] Triggering bulk ingestion: regions=${mappedRegions ? mappedRegions.join(',') : 'ALL'}, satellites=${mappedTypenames ? mappedTypenames.join(',') : 'ALL'}, unlimited=${unlimitedCount}`)

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        if (errorData.message?.includes('MAP_KEY')) {
          return NextResponse.json({
            success: false,
            message: 'NASA FIRMS API key is not configured. Please set FIRMS_MAP_KEY in backend .env file.',
            fetchedCount: 0,
            insertedCount: 0,
          }, { status: 400 })
        }
        return NextResponse.json({
          success: false,
          message: errorData.message || `Backend responded with ${response.status}`,
          fetchedCount: 0,
          insertedCount: 0,
        }, { status: response.status })
      }

      const result = await response.json()
      const data = result.data || {}
      return NextResponse.json({
        success: true,
        message: 'Data ingestion completed successfully',
        fetchedCount: data.totalFetched || 0,
        insertedCount: data.totalInserted || 0,
        updatedCount: data.totalUpdated || 0,
        skippedCount: data.totalSkipped || 0,
        rejectedCount: data.totalRejected || 0,
        source: `bulk:${mappedRegions ? mappedRegions.join(',') : 'ALL'}:${mappedTypenames ? mappedTypenames.join(',') : 'ALL'}`,
        status: 'SUCCESS',
        perRegion: data.results || [],
      })
    }

    // === 走单次 firms-wfs 端点（保留原行为） ===
    const mappedRegion = mappedRegions![0]
    const typename = mappedTypenames![0]
    const count = parseCount(rawCount, 1000)

    console.log(`[Ingest API] Triggering single ingestion: region=${mappedRegion}, typename=${typename}, count=${count}`)

    const url = new URL('http://localhost:8000/api/ingestion/firms-wfs')
    url.searchParams.set('region', mappedRegion)
    url.searchParams.set('typename', typename)
    url.searchParams.set('count', String(count))

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))

      if (errorData.message?.includes('MAP_KEY')) {
        return NextResponse.json({
          success: false,
          message: 'NASA FIRMS API key is not configured. Please set FIRMS_MAP_KEY in backend .env file.',
          fetchedCount: 0,
          insertedCount: 0,
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        message: errorData.message || `Backend responded with ${response.status}`,
        fetchedCount: 0,
        insertedCount: 0,
      }, { status: response.status })
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      message: 'Data ingestion completed successfully',
      fetchedCount: result.fetchedCount || 0,
      insertedCount: result.insertedCount || 0,
      updatedCount: result.updatedCount || 0,
      source: result.source || `${mappedRegion}:${typename}`,
      status: result.status,
    })
  } catch (error) {
    console.error('[Ingest API] Failed to trigger ingestion:', error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to connect to backend',
      fetchedCount: 0,
      insertedCount: 0,
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Use POST to trigger data ingestion',
    supportedRegions: ['All', ...SUPPORTED_REGIONS],
    supportedTypenames: ['all', ...SUPPORTED_TYPENAMES],
  })
}