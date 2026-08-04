"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_ROLE_DEFAULTS = exports.INSTITUTE_HIDDEN_FEATURES = exports.INSTITUTE_SYSTEM_ROLE_SLUGS = exports.PLATFORM_FEATURES = void 0;
exports.emptyPermissions = emptyPermissions;
exports.normalizePermissions = normalizePermissions;
exports.PLATFORM_FEATURES = [
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
];
/** Built-in roles seeded per institute (tenant). Super Admin stays platform-wide only. */
exports.INSTITUTE_SYSTEM_ROLE_SLUGS = ['owner', 'trainer', 'bde', 'student'];
/** Platform-only features hidden from institute role permission matrix */
exports.INSTITUTE_HIDDEN_FEATURES = new Set(['centers', 'roles']);
const ALL_FEATURE_KEYS = exports.PLATFORM_FEATURES.map((f) => f.key);
function fullAccess() {
    return { view: true, add: true, edit: true, delete: true };
}
function viewOnly() {
    return { view: true, add: false, edit: false, delete: false };
}
function none() {
    return { view: false, add: false, edit: false, delete: false };
}
function buildPermissions(overrides) {
    const base = {};
    for (const key of ALL_FEATURE_KEYS) {
        base[key] = overrides[key] ?? none();
    }
    return base;
}
exports.SYSTEM_ROLE_DEFAULTS = {
    super_admin: {
        name: 'Super Admin',
        description: 'Full platform control across all tenants and centers.',
        permissions: buildPermissions(Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, fullAccess()]))),
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
function emptyPermissions() {
    return buildPermissions({});
}
function normalizePermissions(input) {
    const base = emptyPermissions();
    if (!input)
        return base;
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
