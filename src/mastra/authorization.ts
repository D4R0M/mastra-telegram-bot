import NodeCache from 'node-cache';
import {
  upsertWhitelistUser,
  removeWhitelistUser,
  listWhitelist,
  exportWhitelist,
  fetchWhitelist,
} from '../db/userWhitelist.js';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
let seeded = false;
let useDb = true;
const memoryWhitelist = new Map<string, { role: string }>();

function invalidate() {
  cache.del('whitelist');
}

async function loadCache() {
  if (!cache.has('whitelist')) {
    if (useDb) {
      try {
        const rows = await fetchWhitelist();
        const map = new Map<string, { role: string }>();
        for (const r of rows) {
          map.set(String(r.user_id), { role: r.role });
        }
        cache.set('whitelist', map);
      } catch (e) {
        useDb = false;
      }
    }
    if (!useDb) {
      cache.set('whitelist', new Map(memoryWhitelist));
    }
  }
}

async function seedAdmins() {
  if (seeded) return;
  seeded = true;
  const env = process.env.ADMIN_USER_IDS || '';
  const ids = env.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (useDb) {
      try {
        await upsertWhitelistUser({ user_id: id, role: 'admin' });
      } catch {
        useDb = false;
        memoryWhitelist.set(id, { role: 'admin' });
      }
    } else {
      memoryWhitelist.set(id, { role: 'admin' });
    }
  }
  invalidate();
}

export async function isAdmin(userId: string | number | undefined): Promise<boolean> {
  if (userId === undefined || userId === null) return false;
  await seedAdmins();
  await loadCache();
  const map = cache.get('whitelist') as Map<string, { role: string }>;
  const u = map.get(String(userId));
  return u?.role === 'admin';
}

export async function isAuthorizedTelegramUser(
  userId: string | number | undefined,
): Promise<boolean> {
  if (userId === undefined || userId === null) return false;
  await seedAdmins();
  await loadCache();
  const map = cache.get('whitelist') as Map<string, { role: string }>;
  return map.has(String(userId));
}

export async function allowUser(
  userId: string,
  username: string | null,
  note: string | undefined,
  addedBy: string,
): Promise<void> {
  if (useDb) {
    try {
      await upsertWhitelistUser({
        user_id: userId,
        username,
        note,
        added_by: addedBy,
      });
    } catch {
      useDb = false;
      memoryWhitelist.set(userId, { role: 'user' });
    }
  } else {
    memoryWhitelist.set(userId, { role: 'user' });
  }
  invalidate();
}

export async function denyUser(userId: string): Promise<void> {
  if (useDb) {
    try {
      await removeWhitelistUser(userId);
    } catch {
      useDb = false;
      memoryWhitelist.delete(userId);
    }
  } else {
    memoryWhitelist.delete(userId);
  }
  invalidate();
}

export async function listAllowed(
  page = 1,
): Promise<Awaited<ReturnType<typeof listWhitelist>>> {
  await seedAdmins();
  if (useDb) {
    try {
      return await listWhitelist(100, (page - 1) * 100);
    } catch {
      useDb = false;
    }
  }
  const arr = Array.from(memoryWhitelist.keys()).map((id) => ({
    user_id: id,
    username: null,
    role: memoryWhitelist.get(id)!.role,
    added_at: new Date(),
    added_by: null,
    note: null,
  }));
  return arr.slice((page - 1) * 100, page * 100);
}

export async function exportAllowed(): Promise<
  Awaited<ReturnType<typeof exportWhitelist>>
> {
  await seedAdmins();
  if (useDb) {
    try {
      return await exportWhitelist();
    } catch {
      useDb = false;
    }
  }
  return Array.from(memoryWhitelist.keys()).map((id) => ({
    user_id: id,
    username: null,
    role: memoryWhitelist.get(id)!.role,
    added_at: new Date(),
    added_by: null,
    note: null,
  }));
}

export function invalidateWhitelistCache() {
  invalidate();
}

// Invite code handling
interface InviteEntry {
  adminId: string;
  userId?: string;
}
const inviteCodes = new Map<string, InviteEntry>();

export function generateInvite(adminId: string): string {
  const code = Math.random().toString(36).slice(2, 8);
  inviteCodes.set(code, { adminId });
  return code;
}

export function consumeInvite(code: string, userId: string): InviteEntry | null {
  const entry = inviteCodes.get(code);
  if (!entry) return null;
  entry.userId = userId;
  return entry;
}

export function getInvite(code: string): InviteEntry | undefined {
  return inviteCodes.get(code);
}

export function finalizeInvite(code: string): InviteEntry | undefined {
  const entry = inviteCodes.get(code);
  if (entry) inviteCodes.delete(code);
  return entry;
}
