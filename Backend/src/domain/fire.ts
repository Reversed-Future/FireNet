export interface FirePointResponse {
  id: string;
  latitude: number;
  longitude: number;
  confidence: string | null;
  source: string;
  region: string | null;
  satelliteType: string | null;
  wkt: string | null;
  brightness: number | null;
  scan: number | null;
  track: number | null;
  acqDate: string | null;
  acqTime: string | null;
  acqDatetime: string | null;
  brightness2: number | null;
  brightness_2: number | null;
  frp: number | null;
  sourceCount?: number;
  otherSources?: string[];
}

export interface NormalizedFireEvent {
  source: string;
  sourceEventId: string;
  latitude: number;
  longitude: number;
  confidence: string | null;
  confidenceRaw: string | null;
  region: string | null;
  satelliteType: string | null;
  uniqueKey: string | null;
  wkt: string | null;
  brightness: number | null;
  scan: number | null;
  track: number | null;
  acqDate: string | null;
  acqTime: string | null;
  acqDatetime: Date | null;
  brightness2: number | null;
  frp: number | null;
  rawPayload: Record<string, unknown>;
}

export interface RejectedRecord {
  rowNumber: number;
  reason: string;
  rawPayload: Record<string, unknown>;
}
