import type {
  VacuumMapAnnotation,
  VacuumMapTarget,
  VacuumMapTargetGeometry,
  VacuumMapTargetKind,
  VacuumMapTargets,
  VacuumMapTargetSourceMetadata,
  VacuumSourceState,
} from "./state.js";

export type VacuumTargetSelector = {
  id?: string;
  name?: string;
  label?: string;
};

export type VacuumTargetReadinessCheck =
  | {
      ready: true;
      status: "ready";
      target: VacuumMapTarget;
      blockers: [];
    }
  | {
      ready: false;
      status:
        | "missing_target"
        | "invalid_target_geometry"
        | "unsupported_backend"
        | "stale_or_unavailable_map_source"
        | "target_not_callable"
        | "ambiguous_target";
      target?: VacuumMapTarget;
      matches?: VacuumMapTarget[];
      blockers: string[];
    };

export type VacuumTargetReadinessOptions = {
  supported: boolean;
  source?: VacuumSourceState;
  requireGeometry?: boolean;
};

export type RuntimeMapTargetInput = {
  id: string;
  label: string;
  kind?: string;
  available?: boolean;
  geometry?: unknown;
  detail?: string;
};

export function normalizeVacuumMapTargetsFromAnnotations(
  annotations: VacuumMapAnnotation[],
  sourceMetadata: VacuumMapTargetSourceMetadata = { kind: "user_annotation" },
): VacuumMapTargets | undefined {
  const rooms = annotations
    .filter((annotation) => annotation.kind === "room")
    .map((annotation) => targetFromAnnotation(annotation, sourceMetadata));
  const zones = annotations
    .filter((annotation) => annotation.kind === "zone")
    .map((annotation) => targetFromAnnotation(annotation, sourceMetadata));
  return rooms.length > 0 || zones.length > 0 ? { segments: rooms, zones } : undefined;
}

export function normalizeRuntimeMapTargetList(
  values: RuntimeMapTargetInput[] | undefined,
  expectedKind: Extract<VacuumMapTargetKind, "segment" | "zone">,
  sourceMetadata: VacuumMapTargetSourceMetadata = { kind: "runtime" },
): VacuumMapTarget[] {
  const seen = new Set<string>();
  return (values ?? [])
    .filter((item) => (
      item != null &&
      typeof item.id === "string" &&
      item.id.trim() !== "" &&
      typeof item.label === "string" &&
      item.label.trim() !== ""
    ))
    .map((item): VacuumMapTarget => {
      const kind = expectedKind === "segment" && item.kind === "room" ? "room" : expectedKind;
      const geometry = normalizeVacuumMapTargetGeometry(item.geometry) ?? identityGeometry(kind, item.id);
      const geometryValid = validateVacuumTargetGeometry(geometry).valid;
      const callable = item.available === true && geometryValid;
      return {
        id: item.id.trim(),
        label: item.label.trim(),
        kind,
        source: "runtime",
        available: item.available === true,
        callable,
        readiness: callable ? "ready" : geometryValid ? "target_not_callable" : "invalid_target_geometry",
        sourceMetadata,
        geometry,
        detail: typeof item.detail === "string" && item.detail.trim() !== "" ? item.detail : undefined,
      };
    })
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
}

export function normalizeVacuumMapTargetGeometry(value: unknown): VacuumMapTargetGeometry | undefined {
  if (!isRecord(value) || typeof value.type !== "string") {
    return undefined;
  }
  const points = normalizeMapPoints(value.points);
  const bounds = normalizeMapBounds(value.bounds);
  if (value.type === "polygon" && points && points.length >= 3) {
    return { type: "polygon", points };
  }
  if (value.type === "rectangle" && bounds) {
    return { type: "rectangle", bounds };
  }
  if (value.type === "segment_id" && typeof value.segmentId === "string" && value.segmentId.trim() !== "") {
    return { type: "segment_id", segmentId: value.segmentId.trim() };
  }
  if (value.type === "room_id" && typeof value.roomId === "string" && value.roomId.trim() !== "") {
    return { type: "room_id", roomId: value.roomId.trim() };
  }
  if (value.type === "zone_id" && typeof value.zoneId === "string" && value.zoneId.trim() !== "") {
    return { type: "zone_id", zoneId: value.zoneId.trim() };
  }
  if (value.type === "unknown" && (points || bounds)) {
    const geometry: VacuumMapTargetGeometry = { type: "unknown" };
    if (points) geometry.points = points;
    if (bounds) geometry.bounds = bounds;
    return geometry;
  }
  return undefined;
}

export function validateVacuumTargetGeometry(geometry: VacuumMapTargetGeometry | undefined): { valid: boolean; reason?: string } {
  if (!geometry) {
    return { valid: false, reason: "Target geometry is missing." };
  }
  if (geometry.type === "rectangle") {
    return geometry.bounds.width > 0 && geometry.bounds.height > 0
      ? { valid: true }
      : { valid: false, reason: "Rectangle target geometry needs positive width and height." };
  }
  if (geometry.type === "polygon") {
    return geometry.points.length >= 3
      ? { valid: true }
      : { valid: false, reason: "Polygon target geometry needs at least three points." };
  }
  if (geometry.type === "segment_id") {
    return geometry.segmentId.trim() !== "" ? { valid: true } : { valid: false, reason: "Segment target id is missing." };
  }
  if (geometry.type === "room_id") {
    return geometry.roomId.trim() !== "" ? { valid: true } : { valid: false, reason: "Room target id is missing." };
  }
  if (geometry.type === "zone_id") {
    return geometry.zoneId.trim() !== "" ? { valid: true } : { valid: false, reason: "Zone target id is missing." };
  }
  return { valid: false, reason: "Target geometry is not callable." };
}

export function checkVacuumTargetReadiness(
  targets: VacuumMapTargets | undefined,
  kind: "room" | "zone",
  selector: VacuumTargetSelector | undefined,
  options: VacuumTargetReadinessOptions,
): VacuumTargetReadinessCheck {
  if (options.source?.status === "unreachable" || options.source?.status === "stale" || options.source?.stale === true) {
    return {
      ready: false,
      status: "stale_or_unavailable_map_source",
      blockers: [options.source.reason ?? "Map target source is stale or unavailable."],
    };
  }
  const query = normalizeSelector(selector);
  if (!query) {
    return {
      ready: false,
      status: "missing_target",
      blockers: [`Missing ${kind} target. Provide a ${kind} id or name.`],
    };
  }

  const candidates = targetList(targets, kind);
  const matches = candidates.filter((target) => targetMatchesSelector(target, query));
  if (matches.length === 0) {
    return {
      ready: false,
      status: "missing_target",
      blockers: [`No known ${kind} target matches "${query.value}".`],
    };
  }
  if (matches.length > 1) {
    return {
      ready: false,
      status: "ambiguous_target",
      matches,
      blockers: [`${kind} target "${query.value}" is ambiguous; provide a specific id.`],
    };
  }

  const target = matches[0];
  if (!options.supported) {
    return {
      ready: false,
      status: "unsupported_backend",
      target,
      blockers: [`${kind} cleaning is unsupported by the selected normalized backend contract.`],
    };
  }
  const geometry = validateVacuumTargetGeometry(target.geometry);
  if (options.requireGeometry !== false && !geometry.valid) {
    return {
      ready: false,
      status: "invalid_target_geometry",
      target,
      blockers: [geometry.reason ?? `${kind} target geometry is invalid.`],
    };
  }
  if (!target.available || target.callable === false || target.readiness === "target_not_callable") {
    return {
      ready: false,
      status: "target_not_callable",
      target,
      blockers: [target.detail ?? `${kind} target is not currently callable.`],
    };
  }
  return {
    ready: true,
    status: "ready",
    target,
    blockers: [],
  };
}

function targetFromAnnotation(annotation: VacuumMapAnnotation, sourceMetadata: VacuumMapTargetSourceMetadata): VacuumMapTarget {
  const geometry = annotationGeometry(annotation);
  const geometryValid = validateVacuumTargetGeometry(geometry).valid;
  return {
    id: annotation.id,
    label: annotation.name,
    kind: annotation.kind,
    source: "user",
    available: geometryValid,
    callable: geometryValid,
    readiness: geometryValid ? "ready" : "invalid_target_geometry",
    sourceMetadata: {
      ...sourceMetadata,
      mapId: annotation.mapId,
      updatedAt: annotation.updatedAt,
    },
    geometry,
  };
}

function annotationGeometry(annotation: VacuumMapAnnotation): VacuumMapTargetGeometry | undefined {
  if (annotation.area.shape === "rectangle") {
    return {
      type: "rectangle",
      bounds: {
        x: annotation.area.minX,
        y: annotation.area.minY,
        width: annotation.area.maxX - annotation.area.minX,
        height: annotation.area.maxY - annotation.area.minY,
      },
    };
  }
  return {
    type: "polygon",
    points: annotation.area.points,
  };
}

function identityGeometry(kind: VacuumMapTargetKind, id: string): VacuumMapTargetGeometry {
  if (kind === "zone") return { type: "zone_id", zoneId: id.trim() };
  if (kind === "room") return { type: "room_id", roomId: id.trim() };
  return { type: "segment_id", segmentId: id.trim() };
}

function targetList(targets: VacuumMapTargets | undefined, kind: "room" | "zone"): VacuumMapTarget[] {
  if (kind === "zone") return targets?.zones ?? [];
  return (targets?.segments ?? []).filter((target) => target.kind === "room" || target.kind === "segment");
}

function normalizeSelector(selector: VacuumTargetSelector | undefined): { key: "id" | "label"; value: string } | null {
  if (!selector) return null;
  if (typeof selector.id === "string" && selector.id.trim() !== "") return { key: "id", value: selector.id.trim() };
  const label = typeof selector.name === "string" && selector.name.trim() !== ""
    ? selector.name.trim()
    : typeof selector.label === "string" && selector.label.trim() !== ""
      ? selector.label.trim()
      : "";
  return label ? { key: "label", value: label } : null;
}

function targetMatchesSelector(target: VacuumMapTarget, query: { key: "id" | "label"; value: string }): boolean {
  if (query.key === "id") return target.id === query.value;
  return target.label.toLocaleLowerCase() === query.value.toLocaleLowerCase();
}

function normalizeMapPoints(value: unknown): Array<{ x: number; y: number }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const points = value
    .filter((point): point is Record<string, unknown> => isRecord(point))
    .map((point) => ({
      x: typeof point.x === "number" && Number.isFinite(point.x) ? point.x : null,
      y: typeof point.y === "number" && Number.isFinite(point.y) ? point.y : null,
    }))
    .filter((point): point is { x: number; y: number } => point.x != null && point.y != null);
  return points.length > 0 ? points : undefined;
}

function normalizeMapBounds(value: unknown): { x: number; y: number; width: number; height: number } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const x = typeof value.x === "number" && Number.isFinite(value.x) ? value.x : null;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? value.y : null;
  const width = typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 ? value.width : null;
  const height = typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0 ? value.height : null;
  return x != null && y != null && width != null && height != null ? { x, y, width, height } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}
