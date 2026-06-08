// OpenAPI 3.0 specification for FireNet Data Backend.
// Covers all 29 HTTP endpoints exposed by the Express app.

export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'FireNet Data Backend',
    version: '1.0.0',
    description:
      'Node.js + TypeScript PostGIS data pipeline and API for the Global Fire Detection & Visualization Platform. ' +
      'All endpoints return JSON. Authenticated endpoints require a JWT Bearer token in the Authorization header.',
  },
  servers: [
    { url: 'http://localhost:8000', description: 'Local development' },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Fires' },
    { name: 'Ingestion' },
    { name: 'Quality' },
    { name: 'Manage - Users' },
    { name: 'Manage - Zones' },
    { name: 'Manage - Regions' },
    { name: 'Manage - Backup' },
  ],
  paths: {
    // ================== Health ==================
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns the service name, status, and runtime.',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },

    // ================== Auth ==================
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'User login',
        description: 'Authenticates a username/password pair and returns a JWT token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/auth/logs': {
      get: {
        tags: ['Auth'],
        summary: 'List system logs',
        description: 'Returns the latest 1000 system log entries.',
        responses: {
          '200': {
            description: 'Logs retrieved',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LogListResponse' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Auth'],
        summary: 'Create a system log entry',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateLogRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Log created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/admin/regions': {
      get: {
        tags: ['Auth'],
        summary: 'List admin regions',
        responses: {
          '200': {
            description: 'Admin regions',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminRegionListResponse' },
              },
            },
          },
        },
      },
    },

    // ================== Fires ==================
    '/api/fires': {
      get: {
        tags: ['Fires'],
        summary: 'List fire events',
        description: 'Returns a paginated list of fire events. Default reviewStatus is "approved".',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, minimum: 1, maximum: 1000 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
          { name: 'cursor', in: 'query', schema: { type: 'integer' }, description: 'Cursor (last id of previous page)' },
          {
            name: 'bbox',
            in: 'query',
            schema: { type: 'string' },
            description: 'Bounding box: minLon,minLat,maxLon,maxLat',
            example: '100,10,102,12',
          },
          { name: 'sinceHours', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 720 } },
          {
            name: 'reviewStatus',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'approved', 'dismissed', 'all'], default: 'approved' },
          },
        ],
        responses: {
          '200': {
            description: 'Fire event list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FireListResponse' },
              },
            },
          },
          '422': { $ref: '#/components/responses/UnprocessableEntity' },
        },
      },
    },
    '/api/fires/stats': {
      get: {
        tags: ['Fires'],
        summary: 'Fire event statistics',
        responses: {
          '200': {
            description: 'Stats',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FireStatsResponse' },
              },
            },
          },
        },
      },
    },
    '/api/fires/zones': {
      get: {
        tags: ['Fires'],
        summary: 'List approved high-risk zones (public)',
        description: 'Only zones with approval_status = "approved" are returned.',
        responses: {
          '200': {
            description: 'Approved zones',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApprovedZoneListResponse' },
              },
            },
          },
        },
      },
    },
    '/api/fires/bulk-ingest': {
      post: {
        tags: ['Fires'],
        summary: 'Trigger bulk ingestion from NASA FIRMS WFS',
        description: 'Requires FIRMS_MAP_KEY in environment.',
        parameters: [
          { name: 'dryRun', in: 'query', schema: { type: 'boolean', default: false } },
          { name: 'regions', in: 'query', schema: { type: 'string' }, description: 'Comma-separated region names' },
          { name: 'satellites', in: 'query', schema: { type: 'string' }, description: 'Comma-separated typenames' },
        ],
        responses: {
          '200': {
            description: 'Ingestion result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BulkIngestResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/fires/{fireId}': {
      get: {
        tags: ['Fires'],
        summary: 'Get a single fire event',
        parameters: [
          { name: 'fireId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Fire event detail with nearby sources',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FireDetailResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '422': { $ref: '#/components/responses/UnprocessableEntity' },
        },
      },
    },
    '/api/fires/{fireId}/review': {
      patch: {
        tags: ['Fires'],
        summary: 'Approve or dismiss a fire event (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'fireId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FireReviewRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Review applied',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FireReviewResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '422': { $ref: '#/components/responses/UnprocessableEntity' },
        },
      },
    },

    // ================== Ingestion ==================
    '/api/ingestion/runs': {
      get: {
        tags: ['Ingestion'],
        summary: 'List ingestion runs',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Ingestion run list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/IngestionRunListResponse' },
              },
            },
          },
        },
      },
    },
    '/api/ingestion/firms-wfs': {
      post: {
        tags: ['Ingestion'],
        summary: 'Run a single FIRMS WFS ingestion',
        description: 'Fetches CSV rows from NASA FIRMS WFS and stores them via the ingestion pipeline.',
        parameters: [
          { name: 'map_key', in: 'query', schema: { type: 'string' } },
          { name: 'region', in: 'query', schema: { type: 'string', default: 'SouthEast_Asia' } },
          { name: 'typename', in: 'query', schema: { type: 'string', default: 'ms:fires_snpp_24hrs' } },
          { name: 'bbox', in: 'query', schema: { type: 'string', default: '-90,-180,90,180' } },
          { name: 'count', in: 'query', schema: { type: 'integer', default: 1000 } },
          { name: 'dry_run', in: 'query', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          '200': {
            description: 'Ingestion run result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/IngestionRun' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '422': { $ref: '#/components/responses/UnprocessableEntity' },
        },
      },
    },

    // ================== Quality ==================
    '/api/quality/summary': {
      get: {
        tags: ['Quality'],
        summary: 'Data quality summary',
        description: 'Returns the fire_quality_summary view plus the 5 most recent ingestion runs.',
        responses: {
          '200': {
            description: 'Quality summary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QualitySummaryResponse' },
              },
            },
          },
        },
      },
    },

    // ================== Manage - Users ==================
    '/api/manage/users/register': {
      post: {
        tags: ['Manage - Users'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'User created (pending approval)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': { $ref: '#/components/responses/Conflict' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/api/manage/users': {
      get: {
        tags: ['Manage - Users'],
        summary: 'List all users',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'User list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserListResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/manage/users/pending': {
      get: {
        tags: ['Manage - Users'],
        summary: 'List users pending approval (admin)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Pending user list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PendingUserListResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/manage/users/{username}/approve': {
      post: {
        tags: ['Manage - Users'],
        summary: 'Approve a user (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApprovalRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'User approved',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/manage/users/{username}/reject': {
      post: {
        tags: ['Manage - Users'],
        summary: 'Reject a user (admin)',
        description: 'Rejected users are deleted from the database.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApprovalRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'User rejected and deleted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/manage/users/{username}': {
      delete: {
        tags: ['Manage - Users'],
        summary: 'Delete a user (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'User deleted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ================== Manage - Zones ==================
    '/api/manage/zones': {
      get: {
        tags: ['Manage - Zones'],
        summary: 'List all zones',
        responses: {
          '200': {
            description: 'Zone list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ZoneListResponse' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Manage - Zones'],
        summary: 'Create a new zone (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateZoneRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Zone created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Zone' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/manage/zones/pending': {
      get: {
        tags: ['Manage - Zones'],
        summary: 'List zones pending approval (admin)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Pending zone list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ZoneListResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/manage/zones/{zoneId}/approve': {
      post: {
        tags: ['Manage - Zones'],
        summary: 'Approve a zone (admin)',
        description: 'Broadcasts a zoneApproved WebSocket event.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'zoneId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Zone approved',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/manage/zones/{zoneId}/reject': {
      post: {
        tags: ['Manage - Zones'],
        summary: 'Reject a zone (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'zoneId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Zone rejected',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/manage/zones/{zoneId}': {
      delete: {
        tags: ['Manage - Zones'],
        summary: 'Delete a zone (admin)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'zoneId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Zone deleted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StandardResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ================== Manage - Regions ==================
    '/api/manage/regions/auto-calculate': {
      post: {
        tags: ['Manage - Regions'],
        summary: 'Preview high-risk zone calculation (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegionCalcRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Calculated zones preview',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegionCalcResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/manage/regions/sync': {
      post: {
        tags: ['Manage - Regions'],
        summary: 'Sync calculated zones to database (admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegionCalcRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Sync result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegionSyncResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    // ================== Manage - Backup ==================
    '/api/manage/export': {
      get: {
        tags: ['Manage - Backup'],
        summary: 'Export all tables as a gzipped JSON backup (admin)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Gzipped JSON backup file',
            content: {
              'application/gzip': {
                schema: { type: 'string', format: 'binary' },
              },
            },
            headers: {
              'Content-Disposition': {
                schema: { type: 'string' },
                description: 'attachment; filename="fire-detection-backup-<timestamp>.json.gz"',
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/manage/import': {
      post: {
        tags: ['Manage - Backup'],
        summary: 'Import a backup file (admin)',
        description: 'Wipes existing data and imports the provided backup inside a transaction.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ImportRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Import successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token returned by POST /api/auth/login',
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request - missing or invalid parameters',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      Unauthorized: {
        description: 'Missing or invalid JWT token',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions (non-admin trying to access admin endpoint)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      Conflict: {
        description: 'Resource conflict (e.g. duplicate username)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      UnprocessableEntity: {
        description: 'Validation failed (e.g. malformed bbox, bad fireId)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      InternalServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
    schemas: {
      // ---------- Common ----------
      ErrorResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer' },
          message: { type: 'string' },
          data: { nullable: true },
        },
        required: ['code', 'message'],
      },
      StandardResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
        },
        required: ['code', 'message'],
      },
      MessageResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: { type: 'string' },
        },
        required: ['code', 'message', 'data'],
      },

      // ---------- Health ----------
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          service: { type: 'string', example: 'Firenet Data Backend' },
          runtime: { type: 'string', example: 'node-typescript' },
        },
        required: ['status', 'service', 'runtime'],
      },

      // ---------- Auth ----------
      LoginRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
        required: ['username', 'password'],
      },
      LoginUser: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
          approvalStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        },
        required: ['username', 'role', 'approvalStatus'],
      },
      LoginResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: { $ref: '#/components/schemas/LoginUser' },
            },
            required: ['token', 'user'],
          },
        },
        required: ['code', 'message', 'data'],
      },
      CreateLogRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          action: { type: 'string' },
          targetType: { type: 'string' },
          targetId: { type: 'string' },
          targetDetails: { type: 'object', additionalProperties: true },
          status: { type: 'string' },
        },
      },
      LogEntry: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['LOGIN', 'OPERATION'] },
          operator: { type: 'string' },
          action: { type: 'string' },
          status: { type: 'string' },
          target: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['type', 'operator', 'action', 'status', 'target', 'timestamp'],
      },
      LogListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/LogEntry' },
          },
        },
        required: ['code', 'message', 'data'],
      },
      AdminRegion: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id', 'name'],
      },
      AdminRegionListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/AdminRegion' },
          },
        },
        required: ['code', 'message', 'data'],
      },

      // ---------- Fires ----------
      FireEvent: {
        type: 'object',
        description: 'A single fire point (records a FIRMS WFS observation).',
        properties: {
          id: { type: 'string' },
          latitude: { type: 'number', format: 'double' },
          longitude: { type: 'number', format: 'double' },
          confidence: { type: 'string', example: 'high' },
          source: { type: 'string', example: 'firms_wfs:Europe:ms:fires_snpp_24hrs' },
          region: { type: 'string', example: 'Europe' },
          satelliteType: { type: 'string', example: 'ms:fires_snpp_24hrs' },
          wkt: { type: 'string', example: 'POINT(-2.0943 57.1497)' },
          brightness: { type: 'number', format: 'double' },
          scan: { type: 'number', format: 'double' },
          track: { type: 'number', format: 'double' },
          acqDate: { type: 'string', example: '2024-01-01' },
          acqTime: { type: 'string', example: '1200' },
          acqDatetime: { type: 'string', example: '2024-01-01 12:00:00' },
          brightness2: { type: 'number', format: 'double' },
          brightness_2: { type: 'number', format: 'double' },
          frp: { type: 'number', format: 'double' },
          sourceCount: { type: 'integer' },
          otherSources: {
            type: 'array',
            items: { type: 'string' },
          },
          review_status: { type: 'string', enum: ['pending', 'approved', 'dismissed'] },
          published: { type: 'boolean' },
          approved_by: { type: 'string', nullable: true },
          approved_at: { type: 'string', format: 'date-time', nullable: true },
        },
        required: ['id', 'latitude', 'longitude'],
      },
      FireListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          updatedAt: { type: 'string', format: 'date-time' },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          cursor: { type: 'integer', nullable: true },
          nextCursor: { type: 'integer', nullable: true },
          hasMore: { type: 'boolean' },
          points: {
            type: 'array',
            items: { $ref: '#/components/schemas/FireEvent' },
          },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/FireEvent' },
          },
        },
        required: ['code', 'message', 'points', 'data'],
      },
      FireStatsResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          total: { type: 'integer' },
          latestId: { type: 'integer' },
        },
        required: ['code', 'message', 'total', 'latestId'],
      },
      NearbySource: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          source: { type: 'string' },
          region: { type: 'string' },
          satelliteType: { type: 'string' },
          latitude: { type: 'number', format: 'double' },
          longitude: { type: 'number', format: 'double' },
          confidence: { type: 'string' },
          acqDate: { type: 'string' },
          acqTime: { type: 'string' },
        },
      },
      FireDetailResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/FireEvent' },
          detectedSource: { type: 'string' },
          nearbySources: {
            type: 'array',
            items: { $ref: '#/components/schemas/NearbySource' },
          },
        },
        required: ['code', 'message', 'data', 'detectedSource', 'nearbySources'],
      },
      FireReviewRequest: {
        type: 'object',
        properties: {
          reviewStatus: { type: 'string', enum: ['pending', 'approved', 'dismissed'] },
          published: { type: 'boolean' },
        },
        required: ['reviewStatus'],
      },
      FireReviewResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              reviewStatus: { type: 'string', enum: ['pending', 'approved', 'dismissed'] },
              published: { type: 'boolean' },
            },
            required: ['id', 'reviewStatus', 'published'],
          },
        },
        required: ['code', 'message', 'data'],
      },
      BulkIngestResultItem: {
        type: 'object',
        properties: {
          region: { type: 'string' },
          satellite: { type: 'string' },
          status: { type: 'string' },
          fetched: { type: 'integer' },
          inserted: { type: 'integer' },
          updated: { type: 'integer' },
          error: { type: 'string', nullable: true },
        },
      },
      BulkIngestResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              totalRegions: { type: 'integer' },
              totalSatellites: { type: 'integer' },
              totalFetched: { type: 'integer' },
              totalInserted: { type: 'integer' },
              totalUpdated: { type: 'integer' },
              totalRejected: { type: 'integer' },
              results: {
                type: 'array',
                items: { $ref: '#/components/schemas/BulkIngestResultItem' },
              },
            },
            required: ['totalRegions', 'totalSatellites', 'totalFetched', 'totalInserted', 'totalUpdated', 'totalRejected', 'results'],
          },
        },
        required: ['code', 'message', 'data'],
      },

      // ---------- Ingestion ----------
      IngestionRun: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          source: { type: 'string', example: 'firms_wfs:SouthEast_Asia:ms:fires_snpp_24hrs' },
          status: { type: 'string', example: 'success' },
          startedAt: { type: 'string', format: 'date-time' },
          finishedAt: { type: 'string', format: 'date-time', nullable: true },
          fetchedCount: { type: 'integer' },
          insertedCount: { type: 'integer' },
          updatedCount: { type: 'integer' },
          rejectedCount: { type: 'integer' },
          errorMessage: { type: 'string', nullable: true },
          notes: { nullable: true },
        },
        required: ['id', 'source', 'status', 'startedAt'],
      },
      IngestionRunListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/IngestionRun' },
          },
        },
        required: ['code', 'message', 'data'],
      },

      // ---------- Quality ----------
      QualitySummary: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          high_count: { type: 'integer' },
          medium_count: { type: 'integer' },
          low_count: { type: 'integer' },
          pending_count: { type: 'integer' },
          approved_count: { type: 'integer' },
          dismissed_count: { type: 'integer' },
          last_24h_count: { type: 'integer' },
          last_7d_count: { type: 'integer' },
        },
      },
      QualitySummaryResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/QualitySummary' },
          recentRuns: {
            type: 'array',
            items: { $ref: '#/components/schemas/IngestionRun' },
          },
        },
        required: ['code', 'message', 'data', 'recentRuns'],
      },

      // ---------- Users ----------
      RegisterRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
        },
        required: ['username', 'password', 'role'],
      },
      RegisterResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              username: { type: 'string' },
              role: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
            required: ['id', 'username', 'role', 'createdAt'],
          },
        },
        required: ['code', 'message', 'data'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          uid: { type: 'string' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
          approvalStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          lastLogin: { type: 'string', example: '2024-01-01 00:00:00' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'uid', 'username', 'role', 'approvalStatus', 'createdAt'],
      },
      UserListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/User' },
          },
        },
        required: ['code', 'message', 'data'],
      },
      PendingUser: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          uid: { type: 'string' },
          username: { type: 'string' },
          role: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'uid', 'username', 'role', 'createdAt'],
      },
      PendingUserListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/PendingUser' },
          },
        },
        required: ['code', 'message', 'data'],
      },
      ApprovalRequest: {
        type: 'object',
        properties: {
          comment: { type: 'string' },
        },
      },

      // ---------- Zones ----------
      ApprovedZone: {
        type: 'object',
        properties: {
          zoneId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          minLatitude: { type: 'number' },
          maxLatitude: { type: 'number' },
          minLongitude: { type: 'number' },
          maxLongitude: { type: 'number' },
          polygonCoords: { type: 'string', nullable: true },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          historicalIncidents: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['zoneId', 'name', 'riskLevel'],
      },
      ApprovedZoneListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ApprovedZone' },
          },
          total: { type: 'integer' },
        },
        required: ['code', 'message', 'data', 'total'],
      },
      Zone: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          zoneId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          historicalIncidents: { type: 'integer' },
          createdBy: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          isActive: { type: 'boolean' },
          lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['zoneId', 'name', 'riskLevel', 'approvalStatus'],
      },
      ZoneListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Zone' },
          },
        },
        required: ['code', 'message', 'data'],
      },
      CreateZoneRequest: {
        type: 'object',
        properties: {
          zoneId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          minLatitude: { type: 'number' },
          maxLatitude: { type: 'number' },
          minLongitude: { type: 'number' },
          maxLongitude: { type: 'number' },
          polygonCoords: { type: 'string' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
          historicalIncidents: { type: 'integer', default: 0 },
        },
        required: ['zoneId', 'name', 'minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude'],
      },

      // ---------- Regions (auto-calculate / sync) ----------
      RegionCalcRequest: {
        type: 'object',
        properties: {
          sinceHours: { type: 'integer', default: 168, description: 'Time window in hours' },
        },
      },
      CalculatedZone: {
        type: 'object',
        properties: {
          zoneId: { type: 'string' },
          name: { type: 'string' },
          minLat: { type: 'number' },
          maxLat: { type: 'number' },
          minLon: { type: 'number' },
          maxLon: { type: 'number' },
          centerLat: { type: 'number' },
          centerLon: { type: 'number' },
          radiusKm: { type: 'number' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          incidentCount: { type: 'integer' },
        },
      },
      RegionCalcResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              zones: {
                type: 'array',
                items: { $ref: '#/components/schemas/CalculatedZone' },
              },
              message: { type: 'string' },
            },
            required: ['zones', 'message'],
          },
        },
        required: ['code', 'message', 'data'],
      },
      RegionSyncResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              created: { type: 'integer' },
              updated: { type: 'integer' },
              deactivated: { type: 'integer' },
              total: { type: 'integer' },
            },
            required: ['created', 'updated', 'deactivated', 'total'],
          },
        },
        required: ['code', 'message', 'data'],
      },

      // ---------- Backup ----------
      BackupTables: {
        type: 'object',
        description: 'Map of table name to row array. Each row is a generic object matching the table schema.',
        additionalProperties: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        example: {
          ingestion_runs: [],
          fire_events: [],
          users: [],
          user_tokens: [],
          system_logs: [],
          high_risk_zones: [],
        },
      },
      ImportRequest: {
        type: 'object',
        properties: {
          version: { type: 'number', example: 1 },
          exportedAt: { type: 'string', format: 'date-time' },
          tables: { $ref: '#/components/schemas/BackupTables' },
        },
        required: ['version', 'tables'],
      },
      ImportResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              importedAt: { type: 'string', format: 'date-time' },
            },
            required: ['importedAt'],
          },
        },
        required: ['code', 'message', 'data'],
      },
    },
  },
} as const
