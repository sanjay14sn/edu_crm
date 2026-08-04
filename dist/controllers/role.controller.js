"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.duplicateRole = exports.deleteRole = exports.updateRole = exports.createRole = exports.getRoleById = exports.getRoles = exports.getRoleFeatures = exports.seedSystemRoles = void 0;
exports.ensurePlatformRoles = ensurePlatformRoles;
exports.ensureTenantRoles = ensureTenantRoles;
const Role_1 = __importDefault(require("../models/Role"));
const rolePermissions_1 = require("../utils/rolePermissions");
function mapPermissions(doc) {
    return (0, rolePermissions_1.normalizePermissions)(doc.permissions);
}
function formatRole(role) {
    return {
        id: String(role._id),
        name: role.name,
        slug: role.slug,
        description: role.description || '',
        isSystem: role.isSystem,
        baseRole: role.baseRole || null,
        tenantId: role.tenantId ?? null,
        permissions: mapPermissions(role),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
    };
}
function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}
async function migrateLegacyRoles() {
    await Role_1.default.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: null } });
    await Role_1.default.deleteMany({
        tenantId: null,
        slug: { $ne: 'super_admin' },
        isSystem: true,
    });
}
async function ensurePlatformRoles() {
    await migrateLegacyRoles();
    const meta = rolePermissions_1.SYSTEM_ROLE_DEFAULTS.super_admin;
    const existing = await Role_1.default.findOne({ tenantId: null, slug: 'super_admin' });
    if (existing)
        return;
    await Role_1.default.create({
        name: meta.name,
        slug: 'super_admin',
        description: meta.description,
        isSystem: true,
        baseRole: 'super_admin',
        tenantId: null,
        permissions: meta.permissions,
    });
}
async function ensureTenantRoles(tenantId) {
    for (const slug of rolePermissions_1.INSTITUTE_SYSTEM_ROLE_SLUGS) {
        const meta = rolePermissions_1.SYSTEM_ROLE_DEFAULTS[slug];
        if (!meta)
            continue;
        const existing = await Role_1.default.findOne({ tenantId, slug });
        if (existing)
            continue;
        await Role_1.default.create({
            name: meta.name,
            slug,
            description: meta.description,
            isSystem: true,
            baseRole: slug,
            tenantId,
            permissions: meta.permissions,
        });
    }
}
function resolveTenantScope(req) {
    const user = req.user;
    if (!user)
        return { tenantId: null, error: 'Unauthorized', status: 401 };
    if (user.role !== 'super_admin') {
        return { tenantId: null, error: 'Forbidden', status: 403 };
    }
    const tenantId = String(req.query.tenantId || '').trim();
    if (!tenantId) {
        return {
            tenantId: null,
            error: 'Select an institute (tenantId) to manage its roles.',
            status: 400,
        };
    }
    return { tenantId };
}
function assertRoleInScope(role, tenantId) {
    if (String(role.tenantId) !== tenantId) {
        throw new Error('Role does not belong to this institute');
    }
}
const seedSystemRoles = async () => {
    await ensurePlatformRoles();
};
exports.seedSystemRoles = seedSystemRoles;
const getRoleFeatures = (_req, res) => {
    res.status(200).json({ features: rolePermissions_1.PLATFORM_FEATURES });
};
exports.getRoleFeatures = getRoleFeatures;
const getRoles = async (req, res) => {
    try {
        const scope = resolveTenantScope(req);
        if (scope.error) {
            return res.status(scope.status || 400).json({ message: scope.error });
        }
        await ensureTenantRoles(scope.tenantId);
        const roles = await Role_1.default.find({ tenantId: scope.tenantId }).sort({ isSystem: -1, name: 1 });
        res.status(200).json(roles.map(formatRole));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching roles', error });
    }
};
exports.getRoles = getRoles;
const getRoleById = async (req, res) => {
    try {
        const scope = resolveTenantScope(req);
        if (scope.error) {
            return res.status(scope.status || 400).json({ message: scope.error });
        }
        const role = await Role_1.default.findById(req.params.id);
        if (!role)
            return res.status(404).json({ message: 'Role not found' });
        assertRoleInScope(role, scope.tenantId);
        res.status(200).json(formatRole(role));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error fetching role';
        res.status(error instanceof Error && error.message.includes('institute') ? 403 : 500).json({ message });
    }
};
exports.getRoleById = getRoleById;
const createRole = async (req, res) => {
    try {
        const scope = resolveTenantScope(req);
        if (scope.error) {
            return res.status(scope.status || 400).json({ message: scope.error });
        }
        const { name, description, permissions, baseRole } = req.body;
        if (!name?.trim()) {
            return res.status(400).json({ message: 'Role name is required' });
        }
        let slug = slugify(name);
        if (!slug)
            slug = `role_${Date.now()}`;
        const exists = await Role_1.default.findOne({ tenantId: scope.tenantId, slug });
        if (exists) {
            return res.status(400).json({ message: 'A role with this name already exists for this institute' });
        }
        const role = await Role_1.default.create({
            name: name.trim(),
            slug,
            description: description?.trim() || '',
            isSystem: false,
            baseRole: baseRole || undefined,
            tenantId: scope.tenantId,
            permissions: (0, rolePermissions_1.normalizePermissions)(permissions),
        });
        res.status(201).json(formatRole(role));
    }
    catch (error) {
        res.status(400).json({ message: 'Error creating role', error });
    }
};
exports.createRole = createRole;
const updateRole = async (req, res) => {
    try {
        const scope = resolveTenantScope(req);
        if (scope.error) {
            return res.status(scope.status || 400).json({ message: scope.error });
        }
        const role = await Role_1.default.findById(req.params.id);
        if (!role)
            return res.status(404).json({ message: 'Role not found' });
        assertRoleInScope(role, scope.tenantId);
        const { name, description, permissions } = req.body;
        if (name?.trim() && !role.isSystem)
            role.name = name.trim();
        if (description !== undefined)
            role.description = description.trim();
        if (permissions)
            role.permissions = (0, rolePermissions_1.normalizePermissions)(permissions);
        await role.save();
        res.status(200).json(formatRole(role));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error updating role';
        res.status(error instanceof Error && error.message.includes('institute') ? 403 : 400).json({ message });
    }
};
exports.updateRole = updateRole;
const deleteRole = async (req, res) => {
    try {
        const scope = resolveTenantScope(req);
        if (scope.error) {
            return res.status(scope.status || 400).json({ message: scope.error });
        }
        const role = await Role_1.default.findById(req.params.id);
        if (!role)
            return res.status(404).json({ message: 'Role not found' });
        assertRoleInScope(role, scope.tenantId);
        if (role.isSystem) {
            return res.status(400).json({ message: 'System roles cannot be deleted' });
        }
        await Role_1.default.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Role deleted successfully' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error deleting role';
        res.status(error instanceof Error && error.message.includes('institute') ? 403 : 400).json({ message });
    }
};
exports.deleteRole = deleteRole;
const duplicateRole = async (req, res) => {
    try {
        const scope = resolveTenantScope(req);
        if (scope.error) {
            return res.status(scope.status || 400).json({ message: scope.error });
        }
        const source = await Role_1.default.findById(req.params.id);
        if (!source)
            return res.status(404).json({ message: 'Role not found' });
        assertRoleInScope(source, scope.tenantId);
        const baseName = `${source.name} Copy`;
        let slug = slugify(baseName);
        let counter = 1;
        while (await Role_1.default.findOne({ tenantId: scope.tenantId, slug })) {
            slug = slugify(`${baseName}_${counter}`);
            counter += 1;
        }
        const role = await Role_1.default.create({
            name: baseName,
            slug,
            description: source.description,
            isSystem: false,
            baseRole: source.baseRole || undefined,
            tenantId: scope.tenantId,
            permissions: mapPermissions(source),
        });
        res.status(201).json(formatRole(role));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error duplicating role';
        res.status(error instanceof Error && error.message.includes('institute') ? 403 : 400).json({ message });
    }
};
exports.duplicateRole = duplicateRole;
