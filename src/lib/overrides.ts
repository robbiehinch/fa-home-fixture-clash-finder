import type {
  Allocation,
  AllocationOverride,
  AllocationOverrides,
  Assignment,
  Fixture,
  PitchGroup,
} from "./types.js";

const STORAGE_KEY = "pitchAllocationOverrides";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function resolveStorage(storage?: BrowserStorage): BrowserStorage | undefined {
  if (storage) return storage;
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  return undefined;
}

function isOverride(value: unknown): value is AllocationOverride {
  if (!value || typeof value !== "object") return false;
  const v = value as { slot?: unknown };
  if (v.slot === "unassigned") return true;
  if (v.slot && typeof v.slot === "object") {
    const slot = v.slot as { session?: unknown; pitch?: unknown };
    return typeof slot.session === "string" && typeof slot.pitch === "string";
  }
  return false;
}

export function loadOverrides(storage?: BrowserStorage): AllocationOverrides {
  const store = resolveStorage(storage);
  if (!store) return {};
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: AllocationOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isOverride(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveOverrides(
  overrides: AllocationOverrides,
  storage?: BrowserStorage,
): void {
  const store = resolveStorage(storage);
  if (!store) return;
  store.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function clearOverrides(storage?: BrowserStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  store.removeItem(STORAGE_KEY);
}

function slotKey(session: string, pitch: string): string {
  return `${session}\u0000${pitch}`;
}

export function applyOverrides(
  allocation: Allocation,
  group: PitchGroup,
  overrides: AllocationOverrides,
): Allocation {
  const fixturesById = new Map<string, Fixture>();
  for (const a of allocation.assignments) fixturesById.set(a.fixture.id, a.fixture);
  for (const f of allocation.unassigned) fixturesById.set(f.id, f);

  const validSessions = new Set(group.sessions.map((s) => s.name));
  const validPitches = new Set(group.pitches);

  const desiredSlot = new Map<string, { session: string; pitch: string } | "unassigned">();
  for (const fixtureId of fixturesById.keys()) {
    const override = overrides[fixtureId];
    if (!override) continue;
    if (override.slot === "unassigned") {
      desiredSlot.set(fixtureId, "unassigned");
    } else if (
      validSessions.has(override.slot.session) &&
      validPitches.has(override.slot.pitch)
    ) {
      desiredSlot.set(fixtureId, override.slot);
    }
  }

  const slotOwner = new Map<string, string>();
  const newUnassigned: Fixture[] = [];
  let partial = false;

  // First pass: place fixtures with explicit overrides.
  for (const [fixtureId, slot] of desiredSlot) {
    if (slot === "unassigned") {
      newUnassigned.push(fixturesById.get(fixtureId)!);
      continue;
    }
    const key = slotKey(slot.session, slot.pitch);
    if (slotOwner.has(key)) {
      // Conflict between two overrides - last one in iteration wins, push prev to unassigned.
      const prev = slotOwner.get(key)!;
      newUnassigned.push(fixturesById.get(prev)!);
      partial = true;
    }
    slotOwner.set(key, fixtureId);
  }

  // Second pass: place remaining assignments (no override) into their original slot
  // if free; otherwise bump them to unassigned.
  for (const a of allocation.assignments) {
    if (desiredSlot.has(a.fixture.id)) continue;
    const key = slotKey(a.session, a.pitch);
    if (!slotOwner.has(key)) {
      slotOwner.set(key, a.fixture.id);
    } else {
      newUnassigned.push(a.fixture);
      partial = true;
    }
  }

  // Third pass: originally-unassigned fixtures without override stay unassigned.
  for (const f of allocation.unassigned) {
    if (desiredSlot.has(f.id)) continue;
    newUnassigned.push(f);
  }

  const assignments: Assignment[] = [];
  for (const session of group.sessions) {
    for (const pitch of group.pitches) {
      const ownerId = slotOwner.get(slotKey(session.name, pitch));
      if (!ownerId) continue;
      assignments.push({
        session: session.name,
        pitch,
        fixture: fixturesById.get(ownerId)!,
      });
    }
  }

  return {
    date: allocation.date,
    pitchGroup: allocation.pitchGroup,
    assignments,
    unassigned: newUnassigned,
    partialClash: allocation.partialClash || partial,
  };
}

export function setOverride(
  overrides: AllocationOverrides,
  fixtureId: string,
  slot: AllocationOverride["slot"],
): AllocationOverrides {
  return { ...overrides, [fixtureId]: { slot } };
}
