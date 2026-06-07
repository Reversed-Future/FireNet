import type { FeatureCollection, Point } from 'geojson'
import type { FirePoint } from './mock-data'

export function firePointsToGeoJSON(points: FirePoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      properties: {
        id: point.id,
        level: point.level,
        intensity: `${point.frp} MW`,
        intensityValue: point.frp,
        locationName: point.locationName,
        brightness: point.brightness,
        confidence: point.confidence,
        frp: point.frp
      },
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude]
      }
    }))
  }
}

export function heatmapMaxIntensity(points: FirePoint[]): number {
  return Math.max(...points.map((p) => p.frp), 100)
}
