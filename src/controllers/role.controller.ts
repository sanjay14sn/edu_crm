import { Response } from 'express';
import Role from '../models/Role';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  PLATFORM_FEATURES,
  SYSTEM_ROLE_DEFAULTS,
  INSTITUTE_SYSTEM_ROLE_SLUGS,
  normalizePermissions,
  type RolePermissions,
} from '../utils/rolePermissions';

function mapPermissions(doc: { permissions?: RolePermissions | null }): RolePermissions {
  return normalizePermissions(doc.permissions);
}

function formatRole(role: {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
  isSystem: boolean;
  baseRole?: string | null;
  tenantId?: string | null;
  permissions?: RolePermissions | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

async function migrateLegacyRoles() {
  await Role.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: null } });
  await Role.deleteMany({
    tenantId: null,
    slug: { $ne: 'super_admin' },
    isSystem: true,
  });
}

export async function ensurePlatformRoles() {
  await migrateLegacyRoles();
  const meta = SYSTEM_ROLE_DEFAULTS.super_admin;
  const existing = await Role.findOne({ tenantId: null, slug: 'super_admin' });
  if (existing) return;
  await Role.create({
    name: meta.name,
    slug: 'super_admin',
    description: meta.description,
    isSystem: true,
    baseRole: 'super_admin',
    tenantId: null,
    permissions: meta.permissions,
  });
}

export async function ensureTenantRoles(tenantId: string) {
  for (const slug of INSTITUTE_SYSTEM_ROLE_SLUGS) {
    const meta = SYSTEM_ROLE_DEFAULTS[slug];
    if (!meta) continue;
    const existing = await Role.findOne({ tenantId, slug });
    if (existing) continue;
    await Role.create({
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

function resolveTenantScope(req: AuthRequest): { tenantId: string | null; error?: string; status?: number } {
  const user = req.user;
  if (!user) return { tenantId: null, error: 'Unauthorized', status: 401 };

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

function assertRoleInScope(role: { tenantId?: string | null; slug: string }, tenantId: string) {
  if (String(role.tenantId) !== tenantId) {
    throw new Error('Role does not belong to this institute');
  }
}

export const seedSystemRoles = async () => {
  await ensurePlatformRoles();
};

export const getRoleFeatures = (_req: AuthRequest, res: Response) => {
  res.status(200).json({ features: PLATFORM_FEATURES });
};

export const getRoles = async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveTenantScope(req);
    if (scope.error) {
      return res.status(scope.status || 400).json({ message: scope.error });
    }

    await ensureTenantRoles(scope.tenantId!);
    const roles = await Role.find({ tenantId: scope.tenantId }).sort({ isSystem: -1, name: 1 });
    res.status(200).json(roles.map(formatRole));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching roles', error });
  }
};

export const getRoleById = async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveTenantScope(req);
    if (scope.error) {
      return res.status(scope.status || 400).json({ message: scope.error });
    }

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    assertRoleInScope(role, scope.tenantId!);
    res.status(200).json(formatRole(role));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error fetching role';
    res.status(error instanceof Error && error.message.includes('institute') ? 403 : 500).json({ message });
  }
};

export const createRole = async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveTenantScope(req);
    if (scope.error) {
      return res.status(scope.status || 400).json({ message: scope.error });
    }

    const { name, description, permissions, baseRole } = req.body as {
      name?: string;
      description?: string;
      permissions?: RolePermissions;
      baseRole?: string;
    };

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    let slug = slugify(name);
    if (!slug) slug = `role_${Date.now()}`;

    const exists = await Role.findOne({ tenantId: scope.tenantId, slug });
    if (exists) {
      return res.status(400).json({ message: 'A role with this name already exists for this institute' });
    }

    const role = await Role.create({
      name: name.trim(),
      slug,
      description: description?.trim() || '',
      isSystem: false,
      baseRole: baseRole || undefined,
      tenantId: scope.tenantId,
      permissions: normalizePermissions(permissions),
    });

    res.status(201).json(formatRole(role));
  } catch (error) {
    res.status(400).json({ message: 'Error creating role', error });
  }
};

export const updateRole = async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveTenantScope(req);
    if (scope.error) {
      return res.status(scope.status || 400).json({ message: scope.error });
    }

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    assertRoleInScope(role, scope.tenantId!);

    const { name, description, permissions } = req.body as {
      name?: string;
      description?: string;
      permissions?: RolePermissions;
    };

    if (name?.trim() && !role.isSystem) role.name = name.trim();
    if (description !== undefined) role.description = description.trim();
    if (permissions) role.permissions = normalizePermissions(permissions);

    await role.save();
    res.status(200).json(formatRole(role));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error updating role';
    res.status(error instanceof Error && error.message.includes('institute') ? 403 : 400).json({ message });
  }
};

export const deleteRole = async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveTenantScope(req);
    if (scope.error) {
      return res.status(scope.status || 400).json({ message: scope.error });
    }

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    assertRoleInScope(role, scope.tenantId!);
    if (role.isSystem) {
      return res.status(400).json({ message: 'System roles cannot be deleted' });
    }

    await Role.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Role deleted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error deleting role';
    res.status(error instanceof Error && error.message.includes('institute') ? 403 : 400).json({ message });
  }
};

export const duplicateRole = async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveTenantScope(req);
    if (scope.error) {
      return res.status(scope.status || 400).json({ message: scope.error });
    }

    const source = await Role.findById(req.params.id);
    if (!source) return res.status(404).json({ message: 'Role not found' });
    assertRoleInScope(source, scope.tenantId!);

    const baseName = `${source.name} Copy`;
    let slug = slugify(baseName);
    let counter = 1;
    while (await Role.findOne({ tenantId: scope.tenantId, slug })) {
      slug = slugify(`${baseName}_${counter}`);
      counter += 1;
    }

    const role = await Role.create({
      name: baseName,
      slug,
      description: source.description,
      isSystem: false,
      baseRole: source.baseRole || undefined,
      tenantId: scope.tenantId,
      permissions: mapPermissions(source),
    });

    res.status(201).json(formatRole(role));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error duplicating role';
    res.status(error instanceof Error && error.message.includes('institute') ? 403 : 400).json({ message });
  }
};
