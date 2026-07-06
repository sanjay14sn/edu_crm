export type PermissionAction = 'view' | 'add' | 'edit' | 'delete';

export type FeaturePermission = Record<PermissionAction, boolean>;

export type RolePermissions = Record<string, FeaturePermission>;

export const PLATFORM_FEATURES = [
  { key: 'dashboard', label: 'Dashboard', group: 'Core' },
  { key: 'centers', label: 'Centers & Tenants', group: 'Platform' },
  { key: 'roles', label: 'Roles & Permissions', group: 'Platform' },
  { key: 'crm', label: 'Leads CRM', group: 'Sales' },
  { key: 'bde', label: 'BDE Management', group: 'Sales' },
  { key: 'admissions', label: 'Admissions', group: 'Sales' },
  { key: 'followups', label: 'Follow-ups', group: 'Sales' },
  { key: 'tasks', label: 'Tasks', group: 'Sales' },
  { key: 'students', label: 'Students', group: 'Academic' },
  { key: 'trainers', label: 'Trainers', group: 'Academic' },
  { key: 'courses', label: 'Courses & Batches', group: 'Academic' },
  { key: 'lms', label: 'LMS', group: 'Academic' },
  { key: 'attendance', label: 'Attendance', group: 'Academic' },
  { key: 'fees', label: 'Fees & Billing', group: 'Finance' },
  { key: 'campaigns', label: 'Campaigns', group: 'Marketing' },
  { key: 'hr', label: 'HR & Payroll', group: 'Operations' },
  { key: 'jobs', label: 'Job Portal', group: 'Placement' },
  { key: 'analytics', label: 'Analytics', group: 'Insights' },
  { key: 'reports', label: 'Reports', group: 'Insights' },
  { key: 'support', label: 'Support Desk', group: 'Operations' },
  { key: 'settings', label: 'Settings', group: 'Platform' },
] as const;

export type FeatureKey = (typeof PLATFORM_FEATURES)[number]['key'];

/** Built-in roles seeded per institute (tenant). Super Admin stays platform-wide only. */
export const INSTITUTE_SYSTEM_ROLE_SLUGS = ['owner', 'trainer', 'bde', 'student'] as const;

/** Platform-only features hidden from institute role permission matrix */
export const INSTITUTE_HIDDEN_FEATURES = new Set<FeatureKey>(['centers', 'roles']);

const ALL_FEATURE_KEYS = PLATFORM_FEATURES.map((f) => f.key);

function fullAccess(): FeaturePermission {
  return { view: true, add: true, edit: true, delete: true };
}

function viewOnly(): FeaturePermission {
  return { view: true, add: false, edit: false, delete: false };
}

function none(): FeaturePermission {
  return { view: false, add: false, edit: false, delete: false };
}

function buildPermissions(
  overrides: Partial<Record<FeatureKey, FeaturePermission>>
): RolePermissions {
  const base: RolePermissions = {};
  for (const key of ALL_FEATURE_KEYS) {
    base[key] = overrides[key as FeatureKey] ?? none();
  }
  return base;
}

export const SYSTEM_ROLE_DEFAULTS: Record<
  string,
  { name: string; description: string; permissions: RolePermissions }
> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full platform control across all tenants and centers.',
    permissions: buildPermissions(
      Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, fullAccess()])) as Record<
        FeatureKey,
        FeaturePermission
      >
    ),
  },
  owner: {
    name: 'Institute Owner',
    description: 'Full institute operations except platform-level tenant controls.',
    permissions: buildPermissions({
      dashboard: fullAccess(),
      centers: viewOnly(),
      crm: fullAccess(),
      bde: fullAccess(),
      admissions: fullAccess(),
      followups: fullAccess(),
      tasks: fullAccess(),
      students: fullAccess(),
      trainers: fullAccess(),
      courses: fullAccess(),
      lms: fullAccess(),
      attendance: fullAccess(),
      fees: fullAccess(),
      campaigns: fullAccess(),
      hr: fullAccess(),
      jobs: fullAccess(),
      analytics: fullAccess(),
      reports: fullAccess(),
      support: fullAccess(),
      settings: fullAccess(),
    }),
  },
  trainer: {
    name: 'Trainer',
    description: 'Batch delivery, attendance, LMS content, and student progress.',
    permissions: buildPermissions({
      dashboard: viewOnly(),
      students: { view: true, add: false, edit: false, delete: false },
      courses: { view: true, add: false, edit: true, delete: false },
      lms: { view: true, add: true, edit: true, delete: false },
      attendance: { view: true, add: true, edit: true, delete: false },
      jobs: { view: true, add: true, edit: true, delete: false },
      support: viewOnly(),
    }),
  },
  bde: {
    name: 'Business Development Executive',
    description: 'Lead pipeline, follow-ups, admissions, and performance tracking.',
    permissions: buildPermissions({
      dashboard: viewOnly(),
      crm: { view: true, add: true, edit: true, delete: false },
      admissions: { view: true, add: true, edit: true, delete: false },
      followups: fullAccess(),
      tasks: fullAccess(),
      reports: viewOnly(),
      support: { view: true, add: true, edit: false, delete: false },
      attendance: viewOnly(),
    }),
  },
  student: {
    name: 'Student',
    description: 'Portal access for courses, LMS, fees, and placements.',
    permissions: buildPermissions({
      dashboard: viewOnly(),
      courses: viewOnly(),
      lms: viewOnly(),
      attendance: viewOnly(),
      fees: viewOnly(),
      jobs: { view: true, add: true, edit: false, delete: false },
      support: { view: true, add: true, edit: false, delete: false },
    }),
  },
};

export function emptyPermissions(): RolePermissions {
  return buildPermissions({});
}

export function normalizePermissions(input?: RolePermissions | null): RolePermissions {
  const base = emptyPermissions();
  if (!input) return base;
  for (const key of ALL_FEATURE_KEYS) {
    const row = input[key];
    if (row) {
      base[key] = {
        view: Boolean(row.view),
        add: Boolean(row.add),
        edit: Boolean(row.edit),
        delete: Boolean(row.delete),
      };
    }
  }
  return base;
}
