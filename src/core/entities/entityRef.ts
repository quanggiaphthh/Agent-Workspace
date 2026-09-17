import { EntityRef } from '../../../shared/contracts/capability';

export function createEntityRef(
  moduleId: string,
  entityType: string,
  entityId: string,
  label?: string,
  metadata?: Record<string, unknown>
): EntityRef {
  return {
    moduleId,
    entityType,
    entityId,
    label,
    metadata,
  };
}

export function areEntitiesEqual(a?: EntityRef | null, b?: EntityRef | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.moduleId === b.moduleId && a.entityType === b.entityType && a.entityId === b.entityId;
}
