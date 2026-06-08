export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'FireNet Data Backend',
    version: '0.2.0',
    description: 'Node.js + TypeScript PostGIS data pipeline and API.',
  },
  paths: {
    '/health': { get: { summary: 'Health check' } },
    '/api/fires': { get: { summary: 'List fire points for the map frontend' } },
    '/api/fires/{fireId}': { get: { summary: 'Get one fire event detail' } },
    '/api/fires/stats': { get: { summary: 'Get fire statistics' } },
    '/api/ingestion/firms-wfs': { post: { summary: 'Load NASA FIRMS WFS CSV data' } },
    '/api/ingestion/runs': { get: { summary: 'List ingestion runs' } },
    '/api/quality/summary': { get: { summary: 'Data quality summary' } },
  },
}
