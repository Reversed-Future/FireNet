import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    console.log('[Zones API] Request received')
    
    const url = new URL('http://localhost:8000/api/fires/zones')
    
    console.log(`[Zones API] Calling backend: ${url.toString()}`)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log(`[Zones API] Backend response status: ${response.status}`)
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`)
    }

    const result = await response.json()
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to fetch high risk zones:', error)
    return NextResponse.json({
      code: -1,
      message: 'Failed to fetch high risk zones',
      data: [],
      total: 0
    })
  }
}
