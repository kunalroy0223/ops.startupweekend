import type {
  AssetLifecycle, ManagedEventStatus, ProgrammeSessionStatus, ProgrammeStatus, ResourceAllocationStatus,
} from "./types";

const programmeTransitions: Record<ProgrammeStatus, readonly ProgrammeStatus[]> = {
  draft: ["active", "archived"], active: ["completed", "archived"], completed: ["archived"], archived: [],
};
const eventTransitions: Record<ManagedEventStatus, readonly ManagedEventStatus[]> = {
  planning: ["confirmed", "cancelled"], confirmed: ["live", "cancelled"], live: ["completed", "cancelled"],
  completed: ["archived"], cancelled: ["archived"], archived: [],
};
const sessionTransitions: Record<ProgrammeSessionStatus, readonly ProgrammeSessionStatus[]> = {
  planned: ["live", "cancelled"], live: ["completed", "cancelled"], completed: [], cancelled: [],
};
const assetTransitions: Record<AssetLifecycle, readonly AssetLifecycle[]> = {
  available: ["maintenance", "retired", "archived"],
  maintenance: ["available", "retired", "archived"],
  retired: ["archived"],
  archived: [],
};
const allocationTransitions: Record<ResourceAllocationStatus, readonly ResourceAllocationStatus[]> = {
  requested: ["approved", "rejected", "cancelled"], approved: ["checked_out", "cancelled"],
  checked_out: ["returned"], rejected: [], returned: [], cancelled: [],
};

export function canTransitionProgramme(from: ProgrammeStatus, to: ProgrammeStatus): boolean { return programmeTransitions[from].includes(to); }
export function canTransitionEvent(from: ManagedEventStatus, to: ManagedEventStatus): boolean { return eventTransitions[from].includes(to); }
export function canTransitionSession(from: ProgrammeSessionStatus, to: ProgrammeSessionStatus): boolean { return sessionTransitions[from].includes(to); }
export function canTransitionAllocation(from: ResourceAllocationStatus, to: ResourceAllocationStatus): boolean { return allocationTransitions[from].includes(to); }
export function canTransitionAsset(from: AssetLifecycle, to: AssetLifecycle): boolean { return assetTransitions[from].includes(to); }

export function hasAvailableCapacity(totalQuantity: number, committedQuantity: number, requestedQuantity: number): boolean {
  return Number.isInteger(totalQuantity) && Number.isInteger(committedQuantity) && Number.isInteger(requestedQuantity)
    && totalQuantity >= 0 && committedQuantity >= 0 && requestedQuantity > 0
    && committedQuantity + requestedQuantity <= totalQuantity;
}

export function overlapsWindow(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const values = [aStart, aEnd, bStart, bEnd].map(Date.parse);
  if (values.some((value) => !Number.isFinite(value))) return false;
  const [as, ae, bs, be] = values;
  return as! < be! && ae! > bs!;
}


/** Returns the peak concurrent quantity across half-open reservation windows. */
export function maximumConcurrentQuantity(
  reservations: ReadonlyArray<{ startAt: string; endAt: string; quantity: number }>,
): number {
  const points: Array<{ at: number; delta: number }> = [];
  for (const reservation of reservations) {
    const start = Date.parse(reservation.startAt);
    const end = Date.parse(reservation.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
      || !Number.isInteger(reservation.quantity) || reservation.quantity <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    points.push({ at: start, delta: reservation.quantity }, { at: end, delta: -reservation.quantity });
  }
  points.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let maximum = 0;
  for (const point of points) {
    current += point.delta;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}


/** Checks capacity over a requested interval, clipping existing reservations to that interval.
 * Checked-out records consume capacity from the earlier of planned start and actual checkout
 * until an explicit return. Invalid active records fail closed.
 */
export function canFitReservation(
  totalQuantity: number,
  requested: { startAt: string; endAt: string; quantity: number },
  active: ReadonlyArray<{ startAt: string; endAt: string; quantity: number; checkedOutAt?: string | null; checkedOut?: boolean }>,
): boolean {
  const requestStart = Date.parse(requested.startAt);
  const requestEnd = Date.parse(requested.endAt);
  if (!Number.isFinite(requestStart) || !Number.isFinite(requestEnd) || requestEnd <= requestStart
    || !Number.isInteger(requested.quantity) || requested.quantity <= 0
    || !Number.isInteger(totalQuantity) || totalQuantity < 1) return false;

  const reservations: Array<{ startAt: string; endAt: string; quantity: number }> = [requested];
  for (const allocation of active) {
    let start = Date.parse(allocation.startAt);
    const scheduledEnd = Date.parse(allocation.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(scheduledEnd) || scheduledEnd <= start
      || !Number.isInteger(allocation.quantity) || allocation.quantity <= 0) return false;
    if (allocation.checkedOut) {
      if (allocation.checkedOutAt) {
        const actualCheckout = Date.parse(allocation.checkedOutAt);
        if (!Number.isFinite(actualCheckout)) return false;
        start = Math.min(start, actualCheckout);
      }
    }
    const end = allocation.checkedOut ? Number.POSITIVE_INFINITY : scheduledEnd;
    const clippedStart = Math.max(start, requestStart);
    const clippedEnd = Math.min(end, requestEnd);
    if (clippedEnd > clippedStart) {
      reservations.push({
        startAt: new Date(clippedStart).toISOString(),
        endAt: new Date(clippedEnd).toISOString(),
        quantity: allocation.quantity,
      });
    }
  }
  return maximumConcurrentQuantity(reservations) <= totalQuantity;
}
