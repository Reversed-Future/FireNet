export const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: [
    'manage_users',
    'edit_fire_events',
    'delete_fire_events',
    'manage_zones',
    'view_zones',
    'view_fire_events',
    'view_logs',
    'approve_users',
    'reject_users',
    'delete_users'
  ],
  User: [
    'view_zones',
    'view_fire_events',
    'view_logs'
  ]
}

export const hasPermission = (role: string | null, permission: string): boolean => {
  if (!role) return false
  const permissions = ROLE_PERMISSIONS[role]
  return Array.isArray(permissions) && permissions.includes(permission)
}