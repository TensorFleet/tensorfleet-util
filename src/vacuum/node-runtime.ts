import * as http from "http";
import * as https from "https";

import type { ROS2BridgeApi } from "../ros/ros-bridge-api.js";
import type { VacuumAdapter } from "./adapter.js";
import type { VacuumCapabilities } from "./capabilities.js";
import type { VacuumCommand, VacuumCommandName, VacuumCommandResult } from "./commands.js";
import { buildVacuumMapMetadata, parseVacuumMapGrid } from "./mapGrid.js";
import type {
  VacuumAdapterSnapshot,
  VacuumAvailability,
  VacuumBatteryState,
  VacuumFaultState,
  VacuumMapAnnotation,
  VacuumMappingStatus,
  VacuumMissionCollection,
  VacuumMissionSnapshot,
  VacuumReadinessSummary,
  VacuumRuntimeHealth,
  VacuumSourceState,
} from "./state.js";
import {
  mapVacuumCommandToValetudoRequest,
  mapValetudoRuntimeCommandResult,
  mapValetudoRuntimeSnapshotToBoundary,
  mapValetudoState,
  mapVacuumCommandToValetudoRuntimeCommandName,
  type ValetudoCommandRequest,
  type ValetudoRuntimeCommandResult,
  type ValetudoRuntimeCommandRequest,
  type ValetudoRuntimeHealth,
  type ValetudoRuntimeSnapshot,
} from "./backends/valetudo/index.js";
import {
  MISSION_SERVICE_NAMES,
  mapTurtleBot4Nav2Capabilities,
  unsupportedTurtleBot4Nav2Command,
  type TurtleBot4Nav2RuntimeState,
} from "./backends/turtlebot4-nav2/index.js";

const VM_MANAGER_REAL_VACUUM_PATH = "/vms/self/tensorfleet/api/v1/valetudo";
const DIRECT_REAL_VACUUM_PATH = "/api/v1/valetudo";
export const DEFAULT_VACUUM_TIMEOUT_MS = 5000;
const SIMULATION_TOPIC_TIMEOUT_MS = 1200;
const SIMULATION_MISSION_SNAPSHOT_SERVICE = "/vacuum_mission/get_snapshot";
const SIMULATION_MAP_ANNOTATION_SNAPSHOT_SERVICE = "/vacuum_map_annotations/get_snapshot";

type SimulationMissionControlCommand =
  | "pause_mission"
  | "resume_mission"
  | "cancel_mission"
  | "retry_mission_step"
  | "skip_mission_step";

export type VacuumBackend = "valetudo" | "turtlebot4_nav2";
export type VacuumBackendInput = VacuumBackend | "simulation" | "real_vacuum" | "real-vacuum" | "turtlebot4-nav2";
export type VacuumRouteMode = "vm-manager" | "direct";

export type VacuumRuntimeConfig = {
  backend: VacuumBackend;
  routeMode: VacuumRouteMode;
  baseUrl: string;
  token?: string;
  timeoutMs: number;
};

export type VacuumRuntimeContext = {
  rosBridge?: ROS2BridgeApi;
  withRosConnection?: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type VacuumRuntimeHealthSnapshot = {
  availability: VacuumAvailability;
  health: VacuumRuntimeHealth;
  source: VacuumSourceState;
  readiness: VacuumReadinessSummary;
  fault: VacuumFaultState;
};

type RosTopicInfo = { topic: string; type: string };
type RosServiceInfo = { service: string; type: string };

type SimulationRosSnapshot = {
  topics: RosTopicInfo[];
  services: RosServiceInfo[];
  mapMessage: Record<string, unknown> | null;
  poseMessage: Record<string, unknown> | null;
  batteryMessage: Record<string, unknown> | null;
  missionSnapshot: Record<string, unknown> | null;
  mapAnnotationSnapshot: Record<string, unknown> | null;
  updatedAt: number;
};

export async function createVacuumAdapter(
  config: VacuumRuntimeConfig,
  context: VacuumRuntimeContext = {},
): Promise<VacuumAdapter> {
  if (config.backend === "valetudo") {
    return await createValetudoNodeAdapter(config);
  }
  return await createTurtleBot4Nav2Adapter(config, context);
}

export async function readVacuumRuntimeHealth(config: VacuumRuntimeConfig): Promise<VacuumRuntimeHealthSnapshot> {
  if (config.backend !== "valetudo") {
    throw new Error(`Lightweight health checks are not implemented for vacuum backend: ${config.backend}`);
  }

  const health = await requestValetudo<ValetudoRuntimeHealth>(config, "GET", "health");
  const connected = health.runtime.status === "online" || health.runtime.status === "degraded";
  const source = mapValetudoRuntimeHealthSource(health);
  const blockingReasons = [
    ...(health.runtime.status === "offline" ? ["Valetudo integration runtime is offline."] : []),
    ...(source.status === "unreachable" ? ["Valetudo source is unreachable."] : []),
    ...(source.status === "stale" ? ["Valetudo source state is stale."] : []),
  ];

  return {
    availability: {
      status: connected ? "online" : "offline",
      connected,
      detail: connected ? "Valetudo integration runtime is online." : "Valetudo integration runtime is not online.",
    },
    health: {
      runtimeStatus: health.runtime.status,
      updatedAt: health.updatedAt,
      detail:
        health.runtime.status === "online"
          ? "Valetudo integration runtime is online."
          : health.runtime.status === "degraded"
            ? "Valetudo integration runtime is degraded."
            : "Valetudo integration runtime is offline.",
    },
    source,
    readiness: {
      ready: blockingReasons.length === 0,
      blockingReasons,
    },
    fault: {
      readiness: connected ? "waiting" : "unavailable",
      faults: [],
      detail: "Fault state requires a full Valetudo snapshot.",
    },
  };
}

export function normalizeVacuumBackend(value: string): VacuumBackend {
  if (value === "valetudo" || value === "real_vacuum" || value === "real-vacuum") return "valetudo";
  if (value === "simulation" || value === "turtlebot4-nav2" || value === "turtlebot4_nav2") {
    return "turtlebot4_nav2";
  }
  throw new Error(`Unsupported vacuum backend: ${value}`);
}

export function normalizeVacuumTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs == null) return DEFAULT_VACUUM_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive number");
  }
  return timeoutMs;
}

async function createValetudoNodeAdapter(config: VacuumRuntimeConfig): Promise<VacuumAdapter> {
  const runtimeSnapshot = await requestValetudo<ValetudoRuntimeSnapshot>(config, "GET", "snapshot");
  const snapshot = mapValetudoState(mapValetudoRuntimeSnapshotToBoundary(runtimeSnapshot));

  return {
    snapshot,
    sendCommand: async (command) => {
      const latestRuntimeSnapshot = await requestValetudo<ValetudoRuntimeSnapshot>(config, "GET", "snapshot");
      const latestSnapshot = mapValetudoState(mapValetudoRuntimeSnapshotToBoundary(latestRuntimeSnapshot));
      const commandRequest = mapVacuumCommandToValetudoRequest(command, latestSnapshot.capabilities);
      if (!commandRequest.ok) {
        return {
          ok: false,
          command: command.command,
          error: {
            code: commandRequest.reason,
            command: command.command,
            message: commandRequest.message,
          },
        };
      }

      const runtimeCommand = mapVacuumCommandToValetudoRuntimeCommandName(command.command, latestRuntimeSnapshot);
      const runtimeCommandRequest = buildValetudoRuntimeCommandRequest(runtimeCommand, commandRequest.request);
      const runtimeResult = await requestValetudo<ValetudoRuntimeCommandResult>(
        config,
        "POST",
        "command",
        runtimeCommandRequest,
        { allowErrorBody: true },
      );
      return mapValetudoRuntimeCommandResult(command.command, runtimeResult);
    },
  };
}

function buildValetudoRuntimeCommandRequest(
  command: string,
  request: ValetudoCommandRequest,
): ValetudoRuntimeCommandRequest {
  const params = mapValetudoRuntimeCommandParams(request);
  return params == null ? { command } : { command, params };
}

function mapValetudoRuntimeCommandParams(request: ValetudoCommandRequest): Record<string, unknown> | undefined {
  if (request.type === "basic_control") {
    return undefined;
  }
  if (request.type === "set_fan_speed" || request.type === "set_water_usage") {
    return { value: request.value };
  }
  if (request.type === "go_to_location") {
    return { target: request.target };
  }
  if (request.type === "zone_cleaning") {
    return { zones: request.zones };
  }
  return undefined;
}

function mapValetudoRuntimeHealthSource(health: ValetudoRuntimeHealth): VacuumSourceState {
  const status = health.source.stale
    ? "stale"
    : health.source.status === "reachable" || health.source.status === "unreachable"
      ? health.source.status
      : "unknown";
  return {
    kind: mapValetudoRuntimeSourceKind(health.source.kind),
    status,
    stale: health.source.stale,
    lastSeenAt: health.source.lastSeenAt,
    reason: status === "stale" ? "stale_source" : status === "unreachable" ? "source_unreachable" : undefined,
  };
}

function mapValetudoRuntimeSourceKind(kind: ValetudoRuntimeHealth["source"]["kind"]): VacuumSourceState["kind"] {
  if (kind === "fixed_mock" || kind === "valetudo_mock" || kind === "valetudo_http" || kind === "real_robot") {
    return kind;
  }
  return "unknown";
}

async function createTurtleBot4Nav2Adapter(
  _config: VacuumRuntimeConfig,
  context: VacuumRuntimeContext,
): Promise<VacuumAdapter> {
  const rosBridge = context.rosBridge;
  if (!rosBridge) {
    throw new Error("Simulation vacuum actions require a ROS bridge.");
  }

  const read = async () => {
    const rosSnapshot = await readSimulationRosSnapshot(rosBridge);
    return mapSimulationSnapshot(rosSnapshot, rosBridge);
  };

  return {
    snapshot: context.withRosConnection ? await context.withRosConnection(read) : await read(),
    sendCommand: async (command: VacuumCommand): Promise<VacuumCommandResult> => {
      const dispatch = async () => {
        const latestSnapshot = await read();
        return await dispatchTurtleBot4Nav2Command(command, latestSnapshot, rosBridge);
      };
      return context.withRosConnection ? await context.withRosConnection(dispatch) : await dispatch();
    },
  };
}

async function dispatchTurtleBot4Nav2Command(
  command: VacuumCommand,
  snapshot: VacuumAdapterSnapshot,
  rosBridge: ROS2BridgeApi,
): Promise<VacuumCommandResult> {
  if (command.command === "start_navigation") {
    if (!snapshot.capabilities.start_navigation.supported) return unsupportedTurtleBot4Nav2Command(command.command);
    if (!snapshot.readiness.ready) return notReadyCommand(command.command, snapshot.readiness.blockingReasons);
    const parameterResult = await setSimulationMissionRequest(rosBridge, command.command, "navigation_request", {
      target: command.target,
    });
    if (parameterResult) return parameterResult;
    return await callSimulationTriggerService(rosBridge, MISSION_SERVICE_NAMES.startNavigation, command.command);
  }

  if (command.command === "start_coverage") {
    if (!snapshot.capabilities.start_coverage.supported) return unsupportedTurtleBot4Nav2Command(command.command);
    if (!snapshot.readiness.ready) return notReadyCommand(command.command, snapshot.readiness.blockingReasons);
    const payload: Record<string, unknown> = { area: command.area };
    if (command.route && command.route.length > 0) payload.route = command.route;
    if (command.coverage) payload.coverage = command.coverage;
    const parameterResult = await setSimulationMissionRequest(rosBridge, command.command, "coverage_request", payload);
    if (parameterResult) return parameterResult;
    return await callSimulationTriggerService(rosBridge, MISSION_SERVICE_NAMES.startCoverage, command.command);
  }

  const missionServiceByCommand: Record<SimulationMissionControlCommand, string> = {
    pause_mission: MISSION_SERVICE_NAMES.pause,
    resume_mission: MISSION_SERVICE_NAMES.resume,
    cancel_mission: MISSION_SERVICE_NAMES.cancel,
    retry_mission_step: MISSION_SERVICE_NAMES.retryStep,
    skip_mission_step: MISSION_SERVICE_NAMES.skipStep,
  };
  if (isSimulationMissionControlCommand(command.command)) {
    const missionCommand = command.command;
    const missionService = missionServiceByCommand[missionCommand];
    const capability = snapshot.capabilities[missionCommand];
    if (!capability.supported) return unsupportedTurtleBot4Nav2Command(missionCommand);
    return await callSimulationTriggerService(rosBridge, missionService, missionCommand);
  }

  return unsupportedTurtleBot4Nav2Command(command.command);
}

function isSimulationMissionControlCommand(command: VacuumCommandName): command is SimulationMissionControlCommand {
  return (
    command === "pause_mission" ||
    command === "resume_mission" ||
    command === "cancel_mission" ||
    command === "retry_mission_step" ||
    command === "skip_mission_step"
  );
}

async function setSimulationMissionRequest(
  rosBridge: ROS2BridgeApi,
  command: VacuumCommandName,
  parameterName: "navigation_request" | "coverage_request",
  payload: Record<string, unknown>,
): Promise<VacuumCommandResult | null> {
  try {
    const response = await rosBridge.callService<Record<string, unknown>>(
      MISSION_SERVICE_NAMES.setParameters,
      {
        parameters: [
          {
            name: parameterName,
            value: {
              type: 4,
              string_value: JSON.stringify(payload),
            },
          },
        ],
      },
      { timeoutMs: DEFAULT_VACUUM_TIMEOUT_MS },
    );
    const results = Array.isArray(response?.results) ? response.results : [];
    const failed = results.find((entry) => isRecord(entry) && entry.successful === false);
    if (failed) {
      return backendError(command, typeof failed.reason === "string" ? failed.reason : "Mission request parameter update failed.");
    }
    return null;
  } catch (error) {
    return backendError(command, error instanceof Error ? error.message : String(error));
  }
}

async function callSimulationTriggerService(
  rosBridge: ROS2BridgeApi,
  serviceName: string,
  command: VacuumCommandName,
): Promise<VacuumCommandResult> {
  try {
    const response = await rosBridge.callService<Record<string, unknown>>(serviceName, {}, { timeoutMs: DEFAULT_VACUUM_TIMEOUT_MS });
    if (response?.success === false) {
      return backendError(command, typeof response.message === "string" ? response.message : "Mission runtime returned failure.");
    }
    return {
      ok: true,
      command,
      message: typeof response?.message === "string" ? response.message : `Dispatched ${command}.`,
    };
  } catch (error) {
    return backendError(command, error instanceof Error ? error.message : String(error));
  }
}

function notReadyCommand(command: VacuumCommandName, blockers: string[]): VacuumCommandResult {
  return {
    ok: false,
    command,
    error: {
      code: "not_ready",
      command,
      message: `Adapter not ready to dispatch: ${blockers.join(" ")}`,
    },
  };
}

function backendError(command: VacuumCommandName, message: string): VacuumCommandResult {
  return {
    ok: false,
    command,
    error: {
      code: "backend_error",
      command,
      message,
    },
  };
}

function endpoint(config: VacuumRuntimeConfig, path: "health" | "snapshot" | "command"): string {
  const baseUrl = trimTrailingSlash(config.baseUrl);
  const routePrefix = config.routeMode === "direct" ? DIRECT_REAL_VACUUM_PATH : VM_MANAGER_REAL_VACUUM_PATH;
  return `${baseUrl}${routePrefix}/${path}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

type RequestOptions = {
  allowErrorBody?: boolean;
};

async function requestValetudo<T>(
  config: VacuumRuntimeConfig,
  method: "GET" | "POST",
  path: "health" | "snapshot" | "command",
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(endpoint(config, path));
  const payload = body == null ? undefined : JSON.stringify(body);

  return await new Promise<T>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method,
        timeout: config.timeoutMs,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const parsed = text ? safeJsonParse(text) : null;
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            if (options.allowErrorBody && parsed != null) {
              resolve(parsed as T);
              return;
            }
            reject(new Error(`Valetudo runtime request failed with HTTP ${statusCode}.`));
            return;
          }
          if (parsed == null) {
            reject(new Error("Valetudo runtime returned an empty response."));
            return;
          }
          resolve(parsed as T);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Valetudo runtime request timed out after ${config.timeoutMs}ms.`));
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readSimulationRosSnapshot(rosBridge: ROS2BridgeApi): Promise<SimulationRosSnapshot> {
  const topics = typeof rosBridge.getAvailableTopics === "function" ? rosBridge.getAvailableTopics() : [];
  const services = typeof rosBridge.getAvailableServices === "function" ? rosBridge.getAvailableServices() : [];
  const missionSnapshotService = findService(services, SIMULATION_MISSION_SNAPSHOT_SERVICE);
  const annotationSnapshotService = findService(services, SIMULATION_MAP_ANNOTATION_SNAPSHOT_SERVICE);

  const [mapMessage, poseMessage, batteryMessage, missionSnapshot, mapAnnotationSnapshot] = await Promise.all([
    readOptionalRosTopic(rosBridge, findTopic(topics, "/map"), SIMULATION_TOPIC_TIMEOUT_MS),
    readOptionalRosTopic(rosBridge, findFirstTopic(topics, ["/pose", "/amcl_pose", "/odom"]), SIMULATION_TOPIC_TIMEOUT_MS),
    readOptionalRosTopic(rosBridge, findFirstTopic(topics, ["/battery_state", "/battery"]), SIMULATION_TOPIC_TIMEOUT_MS),
    missionSnapshotService ? callOptionalRosService(rosBridge, missionSnapshotService.service) : Promise.resolve(null),
    annotationSnapshotService ? callOptionalRosService(rosBridge, annotationSnapshotService.service) : Promise.resolve(null),
  ]);

  return {
    topics,
    services,
    mapMessage,
    poseMessage,
    batteryMessage,
    missionSnapshot,
    mapAnnotationSnapshot,
    updatedAt: Date.now(),
  };
}

function findTopic(topics: RosTopicInfo[], topic: string): RosTopicInfo | undefined {
  return topics.find((entry) => entry.topic === topic);
}

function findFirstTopic(topics: RosTopicInfo[], candidates: string[]): RosTopicInfo | undefined {
  return candidates.map((topic) => findTopic(topics, topic)).find((entry): entry is RosTopicInfo => entry != null);
}

function findService(services: RosServiceInfo[], service: string): RosServiceInfo | undefined {
  return services.find((entry) => entry.service === service);
}

async function readOptionalRosTopic(
  rosBridge: ROS2BridgeApi,
  topic: RosTopicInfo | undefined,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  if (!topic) return null;

  return await new Promise<Record<string, unknown> | null>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (value: Record<string, unknown> | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
      resolve(value);
    };
    timeout = setTimeout(() => finish(null), timeoutMs);

    try {
      unsubscribe = rosBridge.subscribe({ topic: topic.topic, type: topic.type }, (message: unknown) => {
        finish(isRecord(message) ? message : null);
      });
    } catch {
      finish(null);
    }
  });
}

async function callOptionalRosService(rosBridge: ROS2BridgeApi, service: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await rosBridge.callService<unknown>(service, {}, { timeoutMs: DEFAULT_VACUUM_TIMEOUT_MS });
    return isRecord(result) ? result : null;
  } catch {
    return null;
  }
}

function mapSimulationSnapshot(snapshot: SimulationRosSnapshot, rosBridge: ROS2BridgeApi): VacuumAdapterSnapshot {
  const runtime = buildTurtleBotRuntimeState(snapshot, rosBridge);
  const capabilities = mapTurtleBot4Nav2Capabilities(runtime);
  const grid = parseVacuumMapGrid(snapshot.mapMessage);
  const mapMetadata = buildVacuumMapMetadata(grid, snapshot.mapMessage ? snapshot.updatedAt : null);
  const activeMission = normalizeMission(snapshot.missionSnapshot);
  const recentMissions = normalizeRecentMissions(snapshot.missionSnapshot);
  const missionState = activeMission?.type === "mapping"
    ? "mapping"
    : activeMission?.type === "coverage" || activeMission?.type === "room_cleaning" || activeMission?.type === "zone_cleaning"
      ? "cleaning"
      : activeMission?.type === "navigation"
        ? "navigating"
        : "idle";
  const annotations = normalizeAnnotations(snapshot.mapAnnotationSnapshot);

  return {
    identity: {
      id: "turtlebot4_nav2",
      label: "TurtleBot4/Nav2 Simulation",
      source: "turtlebot4_nav2",
      model: "simulation",
    },
    availability: {
      status: rosBridge.isConnected() ? "online" : "offline",
      connected: rosBridge.isConnected(),
      detail: rosBridge.isConnected() ? "ROS bridge is connected." : "ROS bridge is not connected.",
    },
    capabilities,
    health: {
      runtimeStatus: rosBridge.isConnected() ? "online" : "offline",
      updatedAt: snapshot.updatedAt,
      detail: rosBridge.isConnected() ? "TurtleBot4/Nav2 bridge is online." : "TurtleBot4/Nav2 bridge is offline.",
    },
    source: {
      kind: "turtlebot4_nav2",
      status: rosBridge.isConnected() ? "reachable" : "unreachable",
      stale: false,
      lastSeenAt: snapshot.updatedAt,
    },
    map: {
      readiness: grid ? "ready" : "waiting",
      topic: "/map",
      receiving: grid != null,
      detail: grid ? "Occupancy grid received from ROS." : "Waiting for /map occupancy grid.",
      grid,
      metadata: mapMetadata,
      annotations,
    },
    pose: {
      readiness: runtime.currentMapCoordinates ? "ready" : "waiting",
      available: runtime.currentMapCoordinates != null,
      source: runtime.helperPoseSource,
      coordinates: runtime.currentMapCoordinates ?? null,
      detail: runtime.currentMapCoordinates ? "Pose is available." : "Waiting for localized pose or odometry fallback.",
    },
    navigation: {
      state: "idle",
      backendGoalState: null,
      active: false,
      isSending: false,
      isCanceling: false,
      currentTarget: null,
      terminalState: null,
      planPath: null,
      progress: {
        distanceRemaining: null,
        initialDistance: null,
        recoveries: null,
        navigationTime: null,
        estimatedTimeRemaining: null,
      },
    },
    activity: {
      status: missionState === "cleaning" ? "covering" : missionState,
      label: missionState === "idle" ? "Idle" : titleCase(missionState),
      updatedAt: activeMission?.updatedAt ?? undefined,
      source: "turtlebot4_nav2",
      availableActions: activeMission?.availableActions ?? [],
    },
    mission: {
      state: missionState,
      detail: activeMission ? `Active ${activeMission.type} mission is ${activeMission.status}.` : "No active mission.",
      lastTerminalNavigation: null,
    },
    activeMission,
    missions: {
      active: activeMission,
      recent: recentMissions,
    },
    mapping: buildMappingStatus(activeMission),
    readiness: {
      ready: rosBridge.isConnected(),
      blockingReasons: rosBridge.isConnected() ? [] : ["ROS bridge is not connected."],
    },
    fault: {
      readiness: rosBridge.isConnected() ? "ready" : "unavailable",
      faults: [],
      detail: "No simulation faults reported by this tool runtime.",
    },
    battery: normalizeBattery(snapshot.batteryMessage, rosBridge.isConnected()),
    diagnostics: {
      backend: "turtlebot4_nav2",
      source: {
        topics: snapshot.topics,
        services: snapshot.services,
      },
      raw: {
        missionSnapshot: snapshot.missionSnapshot,
        mapAnnotationSnapshot: snapshot.mapAnnotationSnapshot,
        mapMessage: snapshot.mapMessage,
        poseMessage: snapshot.poseMessage,
        batteryMessage: snapshot.batteryMessage,
      },
    },
  };
}

function buildTurtleBotRuntimeState(
  snapshot: SimulationRosSnapshot,
  rosBridge: ROS2BridgeApi,
): TurtleBot4Nav2RuntimeState {
  const pose = parseSimulationPose(snapshot.poseMessage);
  return {
    connectionStatus: rosBridge.isConnected() ? "connected" : "disconnected",
    availableTopics: snapshot.topics,
    availableServices: snapshot.services.map((entry) => entry.service),
    topicHealth: snapshot.topics.map((entry) => ({
      topic: entry.topic,
      status: entry.topic === "/map" && snapshot.mapMessage ? "receiving" : "advertised",
      lastMessageAt: entry.topic === "/map" && snapshot.mapMessage ? snapshot.updatedAt : null,
    })),
    goalState: "ready",
    currentMapCoordinates: pose,
    helperPoseSource: pose ? "normalized pose" : "unavailable",
  };
}

function parseSimulationPose(message: Record<string, unknown> | null): { x: number; y: number; yaw: number | null } | null {
  const pose = unwrapPose(message);
  const position = isRecord(pose?.position) ? pose.position : null;
  if (!position) return null;
  const x = numberEntry(position, "x");
  const y = numberEntry(position, "y");
  if (x == null || y == null) return null;
  const orientation = isRecord(pose?.orientation) ? pose.orientation : null;
  return {
    x,
    y,
    yaw: orientation ? yawFromQuaternion(orientation) : null,
  };
}

function unwrapPose(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.position)) return value;
  if (isRecord(value.pose)) return unwrapPose(value.pose);
  return null;
}

function yawFromQuaternion(value: Record<string, unknown>): number | null {
  const x = numberEntry(value, "x") ?? 0;
  const y = numberEntry(value, "y") ?? 0;
  const z = numberEntry(value, "z") ?? 0;
  const w = numberEntry(value, "w") ?? 1;
  if (![x, y, z, w].every(Number.isFinite)) return null;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

function normalizeBattery(message: Record<string, unknown> | null, connected: boolean): VacuumBatteryState {
  const percentage = numberEntry(message, "percentage");
  const voltage = numberEntry(message, "voltage");
  const level = percentage != null
    ? percentage <= 1
      ? Math.round(percentage * 100)
      : Math.round(percentage)
    : null;
  return {
    readiness: level == null ? (connected ? "waiting" : "unavailable") : "ready",
    percentage: level,
    charging: stringEntry(message, "power_supply_status") === "1" || stringEntry(message, "power_supply_status") === "charging",
    detail: level == null
      ? voltage != null
        ? `Battery voltage ${voltage}.`
        : "Waiting for battery state."
      : `Battery ${level}%.`,
  };
}

function buildMappingStatus(activeMission: VacuumMissionSnapshot | null): VacuumMappingStatus {
  const isMapping = activeMission?.type === "mapping";
  return {
    state: isMapping ? "auto_mapping" : "idle",
    mode: isMapping ? "auto" : null,
    stateReason: isMapping ? "Mapping mission is active." : "No mapping mission is active.",
    knownRatio: 0,
    unknownRatio: 1,
    frontierCount: 0,
    visitedGoalCount: 0,
    failedGoalCount: 0,
    activeGoal: null,
    lastError: null,
    updatedAt: activeMission?.updatedAt ?? null,
    persistence: "unsupported",
    acceptedSessionLevel: false,
    savedMapPath: null,
    loadedMapPath: null,
    lastSavedAt: null,
    saveError: null,
    loadError: null,
    activeMapName: null,
    savedMaps: [],
  };
}

function normalizeMission(value: unknown): VacuumMissionSnapshot | null {
  const candidate = missionContainer(value);
  return isMissionSnapshot(candidate) ? candidate : null;
}

function normalizeRecentMissions(value: unknown): VacuumMissionCollection["recent"] {
  if (!isRecord(value) || !Array.isArray(value.recent)) return [];
  return value.recent.filter(isMissionSnapshot);
}

function missionContainer(value: unknown): unknown {
  if (!isRecord(value)) return null;
  if (isRecord(value.active)) return value.active;
  if (isRecord(value.mission)) return value.mission;
  return value;
}

function isMissionSnapshot(value: unknown): value is VacuumMissionSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.status === "string" &&
    typeof value.backendSource === "string" &&
    isRecord(value.progress) &&
    Array.isArray(value.availableActions)
  );
}

function normalizeAnnotations(value: unknown): VacuumMapAnnotation[] {
  const annotations = isRecord(value) && Array.isArray(value.annotations)
    ? value.annotations
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : Array.isArray(value)
        ? value
        : [];
  return annotations.filter(isMapAnnotation);
}

function isMapAnnotation(value: unknown): value is VacuumMapAnnotation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "room" || value.kind === "zone") &&
    typeof value.name === "string" &&
    isRecord(value.area) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function numberEntry(value: Record<string, unknown> | null, key: string): number | null {
  if (!value) return null;
  const numeric = typeof value[key] === "string" ? Number(value[key]) : value[key];
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null;
}

function stringEntry(value: Record<string, unknown> | null, key: string): string | null {
  if (!value) return null;
  const entry = value[key];
  return typeof entry === "string" ? entry : typeof entry === "number" ? String(entry) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}
