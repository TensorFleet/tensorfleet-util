// drone-controller.ts
/**
 * High-level drone controller:
 *  - Uses DroneStateModel (subscriptions handled there) to read vehicle state
 *  - Uses ros2Bridge to publish MAVROS setpoints and call MAVROS services
 *  - No ACK system
 *  - Requested/target state with optional automatic enforcement (tick every second)
 */

import * as RosTypes from "../../ros/ros-types.js"
import { DroneStateModel, LANDED, type DroneState } from "../drone-state-model.js";
import type { ROS2BridgeApi } from "../../ros/ros-bridge-api.js";
import { logger } from "../../logger.js";
import deepEqual from "fast-deep-equal";
import typia from "typia";

export enum LandedState {
  UNDEFINED = 0,
  ON_GROUND = 1,
  IN_AIR = 2,
  TAKEOFF = 3,
  LANDING = 4,
}

export type TargetAutoState =
  | null
  | { kind: "landed"; armed: boolean | null }
  | { kind: "airborne"; altMeters: number; yawRad?: number }
  | { kind: "offboard"; target: OffboardTarget}

export type OffboardTarget =
  | { kind: "position_local"; x: number; y: number; z: number; yawRad?: number }
  | { kind: "velocity_local"; vx: number; vy: number; vz: number; yawRate?: number }
  | {
      kind: "raw_local";
      coordinate_frame: number;
      type_mask: number;
      position?: { x: number; y: number; z: number };
      velocity?: { x: number; y: number; z: number };
      acceleration_or_force?: { x: number; y: number; z: number };
      yaw?: number;
      yaw_rate?: number;
    }
  | {
      kind: "raw_attitude";
      type_mask: number;
      orientation?: { x: number; y: number; z: number; w: number };
      body_rate?: { x: number; y: number; z: number };
      thrust?: number;
    }

const _validateTargetAutoState = typia.createValidate<TargetAutoState>();

export function validateTargetAutoState(
    input: unknown,
): typia.IValidation<TargetAutoState> {
  return _validateTargetAutoState(input);
}

export function assertTargetAutoState(input: unknown): TargetAutoState {
  const result = validateTargetAutoState(input);

  if (result.success) {
    return result.data;
  }

  throw new Error(
      result.errors
          .map((e) => `${e.path}: expected ${e.expected}, got ${JSON.stringify(e.value)}`)
          .join("\n"),
  );
}

export interface DroneControllerOptions {
  localFrameId?: string;                // default "map"
  minBatteryForFlight?: number;         // default 0.15
  autoStateManagement?: boolean;        // default false
  stateManagementIntervalMs?: number;   // default 1000
  internalLogCapacity?: number;         // default 200
  internalLogDestinationKey?: string;   // default "__unknown__"
}

export type DroneControllerLogEntryType = "request" | "state_change";

export interface DroneControllerLogEntry {
  at: string;
  type: DroneControllerLogEntryType;
  event: string;
  data?: unknown;
}

export interface DroneControllerLogFilter {
  type?: DroneControllerLogEntryType;
  count?: number;
}

type DroneControllerGlobalLogState = {
  capacity: number;
  entries: DroneControllerLogEntry[];
  lastLoggedStateSummary: Record<string, unknown> | null;
};

type DroneControllerGlobalLogStore = Map<string, DroneControllerGlobalLogState>;

const DRONE_CONTROLLER_LOG_STATE_KEY = Symbol.for("tensorfleet.drone-controller.log-state");
const DEFAULT_DRONE_CONTROLLER_LOG_DESTINATION_KEY = "default";

function getDroneControllerGlobalLogState(
  destinationKey: string,
  capacity: number,
): DroneControllerGlobalLogState {
  const globalObject = globalThis as typeof globalThis & {
    [DRONE_CONTROLLER_LOG_STATE_KEY]?: DroneControllerGlobalLogStore | DroneControllerGlobalLogState;
  };

  let store = globalObject[DRONE_CONTROLLER_LOG_STATE_KEY];
  if (store && !(store instanceof Map)) {
    const migrated = new Map<string, DroneControllerGlobalLogState>();
    migrated.set(DEFAULT_DRONE_CONTROLLER_LOG_DESTINATION_KEY, {
      capacity: store.capacity,
      entries: store.entries,
      lastLoggedStateSummary: store.lastLoggedStateSummary,
    });
    store = migrated;
    globalObject[DRONE_CONTROLLER_LOG_STATE_KEY] = store;
  }

  if (!store) {
    store = new Map<string, DroneControllerGlobalLogState>();
    globalObject[DRONE_CONTROLLER_LOG_STATE_KEY] = store;
  }

  const existing = store.get(destinationKey);
  if (!existing) {
    const created: DroneControllerGlobalLogState = {
      capacity,
      entries: [],
      lastLoggedStateSummary: null,
    };
    store.set(destinationKey, created);
    return created;
  }

  existing.capacity = capacity;
  if (existing.entries.length > capacity) {
    existing.entries.splice(0, existing.entries.length - capacity);
  }

  return existing;
}

export class DroneController {
  private model: DroneStateModel;
  private ros2Bridge: ROS2BridgeApi;
  private opts: Required<DroneControllerOptions>;

  private offboard_state_distance: number = 0.5;
  private offboard_angle_distance: number = 5 * Math.PI / 180;
  private max_offboard_velocity_diff: number = 0.1;

  private _targetAutoState: TargetAutoState = null;

  public get targetAutoState(): TargetAutoState {
    return this._targetAutoState;
  }

  private autoStateEnabled = false;
  private stateManagerInterval: any = null;
  private stateManagerTickRunning = false;

  private latestState: any = {};
  private readonly internalLogCapacity: number;
  private readonly internalLogDestinationKey: string;

  private static readonly MAV_CMD_NAV_TAKEOFF = 22;

  private static readonly T_SETPOINT_POS = "/mavros/setpoint_position/local";
  private static readonly TYPE_POSE_STAMPED = "geometry_msgs/msg/PoseStamped";

  private static readonly T_SETPOINT_VEL = "/mavros/setpoint_velocity/cmd_vel";
  private static readonly TYPE_TWIST_STAMPED = "geometry_msgs/msg/TwistStamped";

  private static readonly T_SETPOINT_RAW_LOCAL = "/mavros/setpoint_raw/local";
  private static readonly TYPE_POSITION_TARGET = "mavros_msgs/msg/PositionTarget";

  private static readonly T_SETPOINT_RAW_ATT = "/mavros/setpoint_raw/attitude";
  private static readonly TYPE_ATTITUDE_TARGET = "mavros_msgs/msg/AttitudeTarget";

  private offboardInterval: any = null;
  private offboardTickRunning = false;
  private lastOffboardModeAttemptMs = 0;
  private lastOffboardTakeoffAttemptMs = 0;

  constructor(model: DroneStateModel, ros2Bridge: ROS2BridgeApi, opts: DroneControllerOptions = {}) {
    this.model = model;
    this.ros2Bridge = ros2Bridge;
    this.opts = {
      localFrameId: opts.localFrameId ?? "map",
      minBatteryForFlight: opts.minBatteryForFlight ?? 0.15,
      autoStateManagement: opts.autoStateManagement ?? false,
      stateManagementIntervalMs: opts.stateManagementIntervalMs ?? 1000,
      internalLogCapacity: opts.internalLogCapacity ?? 200,
      internalLogDestinationKey: opts.internalLogDestinationKey ?? DEFAULT_DRONE_CONTROLLER_LOG_DESTINATION_KEY,
    };
    this.internalLogCapacity = this.opts.internalLogCapacity;
    this.internalLogDestinationKey = this.opts.internalLogDestinationKey;

    this.model.onUpdate((s: Partial<DroneState>) => {
      this.latestState = s;
      this.logStateChange(this.model.getCurrentState());
    });
  }

  async initialize(): Promise<void> {
    this.startOffboardLoop();
    this.startAutoStateLoop();
  }

  dispose(): void {
    if (this.offboardInterval !== null) {
      clearInterval(this.offboardInterval);
      this.offboardInterval = null;
    }

    if (this.stateManagerInterval !== null) {
      clearInterval(this.stateManagerInterval);
      this.stateManagerInterval = null;
    }

    this._targetAutoState = null;
  }

  // -------- Basic services --------

  async arm(): Promise<void> {
    this.logRequest("arm");
    await this._requireConnected();

    if (await this.model.isArmed()) {
      logger.info("[DRONE_CONTROLLER] Drone already armed. Skipping arm command");
      return;
    }

    logger.info("[DRONE_CONTROLLER] Sending arm command...");

    // Workaround. arm might fail due to unsupported state for arm.
    if (await this.model.isLanded()) {
      logger.info("[DRONE_CONTROLLER] Is in landed state while trying to arm. Switching vehicle mode to AUTO.LOITER");
      await this.setMode("AUTO.LOITER");
    }

    const result = await this.mavrosArmDisarm(true);
    logger.info("[DRONE_CONTROLLER] Arm command result:", result);
  }

  async disarm(): Promise<void> {
    this.logRequest("disarm");
    await this._requireConnected();
    logger.info("[DRONE_CONTROLLER] Sending disarm command...");
    const result = await this.mavrosArmDisarm(false);
    logger.info("[DRONE_CONTROLLER] Disarm command result:", result);
  }

  async setMode(mode: string, base = 0, debug = true): Promise<void> {
    this.logRequest("set_mode", { mode, base });
    await this._requireConnected();
    if(debug) {
      logger.info(`[DRONE_CONTROLLER] Setting mode to ${mode} (base=${base})...`);
    }
    const result = await this.mavrosSetMode(mode, base);
    if(debug) {
      logger.info("[DRONE_CONTROLLER] Set mode result:", result);
    }
  }

  async takeoff(altMeters: number = 3, yawRad = 0): Promise<void> {
    this.logRequest("takeoff", { altMeters, yawRad });
    await this.arm();

    const gp = (await this.model.getState()).global_position_int;
    if (!gp) throw new Error("No GPS fix");

    const lat_deg = gp.lat;
    const lon_deg = gp.lon;
    const yaw_deg = yawRad * 180 / Math.PI;

    logger.info(`[DRONE_CONTROLLER] Sending takeoff command: alt=${altMeters}m, yaw=${yaw_deg}° at lat=${lat_deg}, lon=${lon_deg}...`);
    const result = await this.mavrosCommandLong({
      command: DroneController.MAV_CMD_NAV_TAKEOFF,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: yaw_deg,
      param5: lat_deg,
      param6: lon_deg,
      param7: altMeters,
      confirmation: 0,
      broadcast: false,
    });
    logger.info("[DRONE_CONTROLLER] Takeoff command result:", result);
  }

  async land(): Promise<void> {
    this.logRequest("land");
    await this._requireConnected();
    logger.info("[DRONE_CONTROLLER] Sending land command...");
    const result = await this.mavrosLand();
    logger.info("[DRONE_CONTROLLER] Land command result:", result);
  }

  async rtl(): Promise<void> {
    this.logRequest("rtl");
    await this._requireConnected();
    logger.info("[DRONE_CONTROLLER] Sending return-to-launch (RTL) command...");
    const result = await this.mavrosSetMode("AUTO.RTL", 0);
    logger.info("[DRONE_CONTROLLER] RTL command result:", result);
  }

  private async setModeAndWait(
      requestedMode: string,
      timeoutMs = 5000,
  ): Promise<void> {
    logger.info(
        `[DRONE_CONTROLLER] Requesting vehicle mode ${requestedMode}`,
    );

    const result = await this.mavrosSetMode(requestedMode, 0);

    if (!result?.mode_sent) {
      throw new Error(
          `FCU rejected mode request for ${requestedMode}: ${JSON.stringify(result)}`,
      );
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const actualMode =
          this.model.getCurrentState().vehicle?.mode;

      if (actualMode === requestedMode) {
        logger.info(
            `[DRONE_CONTROLLER] Vehicle entered ${requestedMode}`,
        );
        return;
      }

      await this.sleep(100);
    }

    throw new Error(
        `Timed out entering ${requestedMode}; current mode is ${
            this.model.getCurrentState().vehicle?.mode ?? "unknown"
        }`,
    );
  }

  async sendMissionRequest(mission: RosTypes.MavrosMsgsWaypoint[]): Promise<void> {
    this.logRequest("send_mission_request", {
      waypointCount: Array.isArray(mission) ? mission.length : 0,
      firstWaypoint: mission[0]
        ? {
            command: this.describeMissionCommand(mission[0].command),
            frame: this.describeMissionFrame(mission[0].frame),
          }
        : undefined,
    });
    await this._requireConnected();

    if (!Array.isArray(mission) || mission.length === 0) {
      throw new Error("Mission must contain at least one waypoint");
    }

    /*
     * Important: stop the requested-airborne controller from forcing the
     * vehicle back into AUTO.LOITER while the mission is running.
     */
    await this.requestAutoState(null);

    const clearResult = await this.mavrosMissionClear();
    if (!clearResult?.success) {
      throw new Error("Failed to clear existing mission");
    }

    const pushResult = await this.mavrosMissionPush({
      start_index: 0,
      waypoints: mission,
    });

    if (
        !pushResult?.success ||
        pushResult.wp_transfered !== mission.length
    ) {
      throw new Error(
          `Mission push failed: transferred ${
              pushResult?.wp_transfered ?? 0
          }/${mission.length}`,
      );
    }

    logger.info(
        `[DRONE_CONTROLLER] Uploaded ${mission.length} mission waypoints`,
    );

    await this.ensureAirborneBeforeMissionSetCurrent(mission);

    const setCurrentResult = await this.mavrosMissionSetCurrent(0);
    if (!setCurrentResult?.success) {
      throw new Error("Failed to set current mission waypoint");
    }

    await this.setMode("AUTO.MISSION");

    const pullResult = await this.mavrosMissionPull();
    if (
        !pullResult?.success ||
        pullResult.wp_received !== mission.length
    ) {
      throw new Error(
          `Mission verification failed: received ${
              pullResult?.wp_received ?? 0
          }/${mission.length}`,
      );
    }

    logger.info("[DRONE_CONTROLLER] Mission started in AUTO.MISSION");
  }

  private describeMissionCommand(command: number): string {
    const commandName = RosTypes.MavrosMissionCommand[command];
    return commandName ? `${commandName} (${command})` : `UNKNOWN (${command})`;
  }

  private describeMissionFrame(frame: number): string {
    const frameName = RosTypes.MavrosMissionFrame[frame];
    return frameName ? `${frameName} (${frame})` : `UNKNOWN (${frame})`;
  }

  private async ensureAirborneBeforeMissionSetCurrent(
    mission: RosTypes.MavrosMsgsWaypoint[],
    takeoffAltMeters = 1,
    timeoutMs = 15000,
  ): Promise<void> {
    await this.waitForStateReady();

    if (this.isDroneAirborne()) {
      return;
    }

    if (mission[0]?.command === RosTypes.MavrosMissionCommand.TAKEOFF) {
      logger.info("[DRONE_CONTROLLER] Mission starts with a takeoff waypoint. Skipping pre-takeoff before setting current mission waypoint.");
      return;
    }

    logger.info(`[DRONE_CONTROLLER] Drone is not airborne. Requesting ${takeoffAltMeters}m takeoff before setting current mission waypoint...`);
    await this.takeoff(takeoffAltMeters);
    await this.waitUntilAirborne(timeoutMs);
  }

  // -------- Requested state / auto state management --------

  public async requestAutoState(state: TargetAutoState): Promise<void> {
    const targetState = assertTargetAutoState(state);
    this.logRequest("request_auto_state", { targetState });
    this._targetAutoState = structuredClone(targetState);

    if(targetState) {
      await this.waitForStateReady();
      await this._tickAutoState();
      while(deepEqual(this._targetAutoState,targetState) && !this.isInRequestedAutoState()) {
        await this.sleep(100);
      }

      logger.info("[DRONE_CONTROLLER] Target auto state reached:\n", targetState);
    } else {
      logger.info("[DRONE_CONTROLLER] Target auto state cleared");
    }
  }

  private async waitForStateReady(timeoutMs = 5000): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const state = await this.model.getState();

      if (state.vehicle?.connected === true && state.extended?.landed_state != null) {
        return;
      }

      await this.sleep(100);
    }

    throw new Error("Timed out waiting for drone telemetry before setting autopilot state");
  }

  private async waitUntilAirborne(timeoutMs = 15000): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (this.isDroneAirborne()) {
        return;
      }

      await this.sleep(200);
    }

    throw new Error("Timed out waiting for drone to become airborne before setting current mission waypoint");
  }

  public clearAutoState(): void {
    this.logRequest("clear_auto_state");
    this.requestAutoState(null);
  }

  public getInternalLog(filter?: DroneControllerLogFilter): DroneControllerLogEntry[] {
    const store = this.getInternalLogStore();
    const type = filter?.type;
    const count = filter?.count;

    let entries = type
      ? store.entries.filter((entry) => entry.type === type)
      : [...store.entries];

    if (typeof count === "number" && Number.isFinite(count) && count > 0 && entries.length > count) {
      entries = entries.slice(entries.length - count);
    }

    return structuredClone(entries);
  }

  private isDroneAirborne(state: DroneState = this.model.getCurrentState()): boolean {
    if (!state.vehicle || state.vehicle.connected !== true) {
      return false;
    }

    const landed = DroneStateModel.isStateLanded(state);
    const landing = DroneStateModel.isStateLanding(state);
    const takingOff = DroneStateModel.isStateTakingOff(state);
    const onGround = state.extended?.landed_state === LANDED.ON_GROUND;

    return (state.vehicle.armed && !(landed || landing || takingOff || onGround)) ?? false;
  }

  public isInRequestedAutoState(debug: boolean = false): boolean {
    let currentState = this.model.getCurrentState();

    if (!currentState.vehicle || currentState.vehicle.connected !== true) {
      return false;
    }

      const landed = DroneStateModel.isStateLanded(currentState);
      const landing = DroneStateModel.isStateLanding(currentState);
      const takingOff = DroneStateModel.isStateTakingOff(currentState);
      const offboard = DroneStateModel.isStateOffboard(currentState);
      const onGround = currentState.extended?.landed_state === LANDED.ON_GROUND;

    if(debug) {
      logger.debug("[AUTO_STATE] Requested :", this.targetAutoState, "\nCurrent state :", { extended: currentState.extended, vehicle: currentState.vehicle});
    }

    switch (this.targetAutoState?.kind) {
      case undefined:
        return true;
      case "landed": {
        return landed && (this.targetAutoState.armed === null || this.targetAutoState.armed === currentState.vehicle?.armed);
      }
      case "airborne": {
        return this.isDroneAirborne(currentState);
      }
      case "offboard": {
        // TODO : add offboard target checks
        if (!(currentState.vehicle?.armed && offboard)) {
          return false;
        }

        const offboardTarget = this.targetAutoState.target;
        switch(offboardTarget.kind) {
          case "position_local": {
            const currPos = currentState.local?.position;
            if (!currPos) {
              logger.warn("[AUTO_STATE] No current position available for position_local check");
              return false;
            }

            const dx = currPos.x - offboardTarget.x;
            const dy = currPos.y - offboardTarget.y;
            const dz = currPos.z - offboardTarget.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > this.offboard_state_distance) {
              return false;
            }

            if (offboardTarget.yawRad !== undefined) {
              const currOrient = currentState.local?.orientation;
              if (!currOrient) {
                logger.warn("[AUTO_STATE] No current orientation available for yaw check");
                return false;
              }

              const currYaw = this._quatToYaw(currOrient);
              let yawDiff = currYaw - offboardTarget.yawRad;

              // Normalize yaw difference to [-pi, pi]
              yawDiff = ((yawDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

              if (Math.abs(yawDiff) > this.offboard_angle_distance) {
                return false;
              }
            }

            return true;
          }
          case "velocity_local": {
            const currVel = currentState.local?.linear;
            if (!currVel) {
              logger.warn("[AUTO_STATE] No current velocity available for velocity_local check");
              return false;
            }

            const dvx = currVel.x - offboardTarget.vx;
            const dvy = currVel.y - offboardTarget.vy;
            const dvz = currVel.z - offboardTarget.vz;
            const velDiff = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);

            return velDiff <= this.max_offboard_velocity_diff;
          }
          default:
            logger.warn("[INFO] requested state check of type 'offboardTarget.kind' not supported yet");
            return true;
        }
      }
    }
  }

  private startAutoStateLoop(): void {
    this.stateManagerInterval = setInterval(() => {
      void this._tickAutoState();
    }, this.opts.stateManagementIntervalMs);
  }

  private async _tickAutoState(targetOverride?: TargetAutoState): Promise<void> {
    const targetAutoState = targetOverride ?? this.targetAutoState;

    if (!targetAutoState) return;
    if (targetAutoState.kind === "offboard") {
      // Offboard has it's own ticker.
      return;
    }
    if (this.stateManagerTickRunning) return;
    this.stateManagerTickRunning = true;

    logger.debug(`[AUTO_STATE] Tick: targetAutoState=${JSON.stringify(targetAutoState)}`);

    try {
      let currentState = this.model.getCurrentState();
      if (!DroneStateModel.isStateConnected(currentState)) {
        logger.debug("[AUTO_STATE] Drone not connected, skipping tick");
        return;
      }

      const landed = DroneStateModel.isStateLanded(currentState);
      const landing = DroneStateModel.isStateLanding(currentState);
      const takingOff = DroneStateModel.isStateTakingOff(currentState);
      const onGround = currentState.extended?.landed_state === LANDED.ON_GROUND;

      logger.debug(`[AUTO_STATE] Current state: armed=${currentState.vehicle?.armed}, mode=${currentState.vehicle?.mode}, landed=${currentState.extended?.landed_state}`);

      switch (targetAutoState.kind) {
        case "landed": {
          // We need the drone landed.
          if (landing) {
            return;
          }

          if(landed) {
            // FIXME: TargetAutoState type allows armed: boolean | null for "landed" state, where null likely means "don't change arm state".
            // However, when armed is null, the comparison this.targetAutoState.armed != currentState.vehicle?.armed is always true (since null != true and null != false),
            // and the subsequent if(this.targetAutoState.armed) check treats null as falsy, causing an unintended disarm command regardless of current state.
            // Do we want to disarm?
            if(targetAutoState.armed != currentState.vehicle?.armed) {
              // We need to change the arm state.
              if(targetAutoState.armed) {
                logger.info('[AUTO_STATE] Requesting drone arm');
                await this.arm();
              } else {
                logger.info('[AUTO_STATE] Requesting drone disarm');
                await this.disarm();
              }
            }

            return;
          }


          logger.debug(`[AUTO_STATE] Landed state check: landed=${landed}, onGround=${onGround}, landing=${landing}`);

          if (!landing) {
            logger.info("[AUTO_STATE] vehicle not landing. Requesting land");
            await this.land();
            return
          }
          return;
        }

        case "airborne": {
          let requestedAltitude = targetAutoState.altMeters;

          if(landed) {
            logger.info("[AUTO_STATE] Processing airborne state [landed = true]. Requesting takeoff");
            await this.takeoff(requestedAltitude);
            return;
          }

          if(landing) {
            logger.info("[AUTO_STATE] Processing airborne state [landing = true]. Requesting takeoff");
            await this.takeoff(requestedAltitude);
            return;
          }

          if(takingOff) {
            logger.info("[AUTO_STATE] Processing airborne state [takingoff = true]. Doing nothing");
            return;
          }

          if(currentState.vehicle?.mode != "AUTO.LOITER") {
            // TODO : add more checks.
            logger.info("[AUTO_STATE] airborne requested. vehicle mode not in AUTO.LOTIER mode. Setting it to AUTO.LOTIER");
            await this.setMode("AUTO.LOITER");
          }
          
          return;
        }
      }
    } catch (e) {
      logger.error(`[AUTO_STATE] Error in tick: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.stateManagerTickRunning = false;
    }
  }

  // -------- OFFBOARD --------
  private startOffboardLoop(): void {
    if (this.offboardInterval !== null) return;

    this.offboardInterval = setInterval(() => {
      void this._tickOffboard();
    }, 50);
  }

  private async _tickOffboard(): Promise<void> {
    const offboardTarget = this.targetAutoState?.kind === "offboard" ? this.targetAutoState.target : undefined;

    if (!offboardTarget) return;
    if (this.offboardTickRunning) return;
    this.offboardTickRunning = true;

    try {
      await this._requireConnected();

      const currentState = this.model.getCurrentState();
      if (!DroneStateModel.isStateConnected(currentState)) {
        return;
      }

      const takingOff = DroneStateModel.isStateTakingOff(currentState);
      const landing = DroneStateModel.isStateLanding(currentState);
      const landed = DroneStateModel.isStateLanded(currentState);
      const isOffboard = DroneStateModel.isStateOffboard(currentState);
      const armed = DroneStateModel.isStateArmed(currentState);

      if (takingOff || landing || landed) {
        await this._tickAutoState(this._buildAirborneOverrideFromOffboardTarget(offboardTarget, currentState));
        return;
      }

      if (!armed) {
        await this.arm();
      }


      if (!isOffboard) {
        await this.setMode("OFFBOARD", 0, false);
      }

      this.publishOffboardTarget(offboardTarget);
    } finally {
      this.offboardTickRunning = false;
    }
  }

  private _buildAirborneOverrideFromOffboardTarget(
    offboardTarget: OffboardTarget,
    currentState: DroneState,
  ): TargetAutoState {
    switch (offboardTarget.kind) {
      case "position_local":
        return {
          kind: "airborne",
          altMeters: Math.abs(offboardTarget.z),
          yawRad: offboardTarget.yawRad,
        };
      case "raw_local":
        return {
          kind: "airborne",
          altMeters: Math.abs(offboardTarget.position?.z ?? currentState.local?.position?.z ?? 3),
          yawRad: offboardTarget.yaw,
        };
      default:
        return {
          kind: "airborne",
          altMeters: Math.abs(currentState.local?.position?.z ?? 3),
        };
    }
  }

  public publishOffboardTarget(target: OffboardTarget): void {
    switch (target.kind) {
      case "position_local": {
        const yaw = (typeof target.yawRad === "number" && Number.isFinite(target.yawRad))
          ? target.yawRad
          : (typeof (this.latestState as any)?.yaw === "number" ? (this.latestState as any).yaw : 0);

        const msg = {
          header: this._header(this.opts.localFrameId),
          pose: {
            position: { x: target.x, y: target.y, z: target.z },
            orientation: this._yawToQuat(yaw),
          },
        };

        this._publish(DroneController.T_SETPOINT_POS, DroneController.TYPE_POSE_STAMPED, msg);
        return;
      }

      case "velocity_local": {
        const yawRate = (typeof target.yawRate === "number" && Number.isFinite(target.yawRate)) ? target.yawRate : 0;

        const msg = {
          header: this._header(this.opts.localFrameId),
          twist: {
            linear: { x: target.vx, y: target.vy, z: target.vz },
            angular: { x: 0, y: 0, z: yawRate },
          },
        };

        this._publish(DroneController.T_SETPOINT_VEL, DroneController.TYPE_TWIST_STAMPED, msg);
        return;
      }

      case "raw_local": {
        const pos = target.position ?? { x: 0, y: 0, z: 0 };
        const vel = target.velocity ?? { x: 0, y: 0, z: 0 };
        const acc = target.acceleration_or_force ?? { x: 0, y: 0, z: 0 };

        const msg = {
          header: this._header(this.opts.localFrameId),
          coordinate_frame: target.coordinate_frame,
          type_mask: target.type_mask,
          position: { x: pos.x, y: pos.y, z: pos.z },
          velocity: { x: vel.x, y: vel.y, z: vel.z },
          acceleration_or_force: { x: acc.x, y: acc.y, z: acc.z },
          yaw: (typeof target.yaw === "number" && Number.isFinite(target.yaw)) ? target.yaw : 0,
          yaw_rate: (typeof target.yaw_rate === "number" && Number.isFinite(target.yaw_rate)) ? target.yaw_rate : 0,
        };

        this._publish(DroneController.T_SETPOINT_RAW_LOCAL, DroneController.TYPE_POSITION_TARGET, msg);
        return;
      }

      case "raw_attitude": {
        const msg = {
          header: this._header(this.opts.localFrameId),
          type_mask: target.type_mask,
          orientation: target.orientation ?? { x: 0, y: 0, z: 0, w: 1 },
          body_rate: target.body_rate ?? { x: 0, y: 0, z: 0 },
          thrust: (typeof target.thrust === "number" && Number.isFinite(target.thrust)) ? target.thrust : 0,
        };

        this._publish(DroneController.T_SETPOINT_RAW_ATT, DroneController.TYPE_ATTITUDE_TARGET, msg);
        return;
      }
    }
  }

  private _publish(topic: string, type: string, msg: any): void {
  const b: any = this.ros2Bridge as any;

    if (!b || typeof b.publish !== "function") {
      throw new Error("ros2Bridge.publish is missing");
    }

    // Call the wrapper exactly as implemented:
    b.publish(topic, type, msg);
  }


  // -------- MAVROS service helpers --------

  async mavrosCommandLong(req: RosTypes.CommandLong_Request): Promise<RosTypes.CommandLong_Response> {
    return await this.ros2Bridge.callService<RosTypes.CommandLong_Response>("/mavros/cmd/command", req);
  }

  async mavrosArmDisarm(value: boolean): Promise<RosTypes.CommandBool_Response> {
    const req: RosTypes.CommandBool_Request = { value };
    return await this.ros2Bridge.callService<RosTypes.CommandBool_Response>("/mavros/cmd/arming", req);
  }

  async mavrosSetMode(custom_mode: string, base_mode = 0): Promise<RosTypes.SetMode_Response> {
    const req: RosTypes.SetMode_Request = { base_mode, custom_mode };
    return await this.ros2Bridge.callService<RosTypes.SetMode_Response>("/mavros/set_mode", req);
  }

  async mavrosLand(args: {
    altitude?: number;
    yaw?: number;
    latitude?: number;
    longitude?: number;
  } = {}): Promise<RosTypes.CommandTOL_Response> {
    const req: RosTypes.CommandTOL_Request = {
      altitude: args.altitude ?? 0.0,
      min_pitch: 0.0,
      yaw: args.yaw ?? 0.0,
      latitude: args.latitude ?? 0.0,
      longitude: args.longitude ?? 0.0,
    };
    return await this.ros2Bridge.callService<RosTypes.CommandTOL_Response>("/mavros/cmd/land", req);
  }

  async mavrosMissionClear(): Promise<RosTypes.WaypointClear_Response> {
    return await this.ros2Bridge.callService<RosTypes.WaypointClear_Response>("/mavros/mission/clear", {});
  }

  async mavrosMissionPush(req: RosTypes.WaypointPush_Request): Promise<RosTypes.WaypointPush_Response> {
    return await this.ros2Bridge.callService<RosTypes.WaypointPush_Response>("/mavros/mission/push", req);
  }

  async mavrosMissionPull(): Promise<RosTypes.WaypointPull_Response> {
    return await this.ros2Bridge.callService<RosTypes.WaypointPull_Response>("/mavros/mission/pull", {});
  }

  async mavrosMissionSetCurrent(wp_seq: number): Promise<RosTypes.WaypointSetCurrent_Response> {
    return await this.ros2Bridge.callService<RosTypes.WaypointSetCurrent_Response>("/mavros/mission/set_current", { wp_seq });
  }

  // -------- Helpers --------

  private async _requireConnected() {
    const s = await this.model.getState();
    if (!s?.vehicle?.connected) {
      throw new Error("FCU not connected");
    }
  }

  private async _requireBattery(min: number, action: string) {
    const pct = (await this.model.getState()).battery?.percentage;
    if (typeof pct === "number" && pct < min) {
      throw new Error(`Battery ${(pct * 100).toFixed(0)}% < ${(min * 100).toFixed(0)}% required to ${action}`);
    }
  }

  private _header(frame_id: string) {
    return { stamp: this._now(), frame_id };
  }

  private _now() {
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    const nanosec = (now - sec * 1000) * 1_000_000;
    return { sec, nanosec };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logRequest(event: string, data?: unknown): void {
    this.pushLogEntry({
      at: new Date().toISOString(),
      type: "request",
      event,
      data: data === undefined ? undefined : structuredClone(data),
    });
  }

  private logStateChange(state: DroneState): void {
    const store = this.getInternalLogStore();
    const summary = this.summarizeStateForLog(state);

    if (store.lastLoggedStateSummary === null) {
      store.lastLoggedStateSummary = summary;
      this.pushLogEntry({
        at: new Date().toISOString(),
        type: "state_change",
        event: "state_snapshot",
        data: summary,
      });
      return;
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, value] of Object.entries(summary)) {
      const previous = store.lastLoggedStateSummary[key];
      if (!deepEqual(previous, value)) {
        changes[key] = { from: previous, to: value };
      }
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    store.lastLoggedStateSummary = summary;
    this.pushLogEntry({
      at: new Date().toISOString(),
      type: "state_change",
      event: "state_changed",
      data: changes,
    });
  }

  private summarizeStateForLog(state: DroneState): Record<string, unknown> {
    return {
      connected: state.vehicle?.connected ?? null,
      armed: state.vehicle?.armed ?? null,
      mode: state.vehicle?.mode ?? null,
      landed_state: state.extended?.landed_state ?? null,
      armable: state.status?.armable ?? null,
      faults: state.status?.faults ?? null,
      mission_current_seq: state.mission?.current_seq ?? null,
      mission_reached_seq: state.mission?.reached_seq ?? null,
      mission_completed: state.mission?.completed ?? null,
    };
  }

  private pushLogEntry(entry: DroneControllerLogEntry): void {
    const store = this.getInternalLogStore();
    store.entries.push(entry);
    if (store.entries.length > store.capacity) {
      store.entries.splice(0, store.entries.length - store.capacity);
    }
  }

  private getInternalLogStore(): DroneControllerGlobalLogState {
    return getDroneControllerGlobalLogState(
      this.internalLogDestinationKey,
      this.internalLogCapacity,
    );
  }

  private _yawToQuat(yaw: number): RosTypes.GeometryQuaternion {
    const half = yaw / 2;
    return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
  }

  private _quatToYaw(quat: RosTypes.GeometryQuaternion): number {
    const { x, y, z, w } = quat;
    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  }
}
