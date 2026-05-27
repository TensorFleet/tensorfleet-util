import * as __typia_transform__validateReport from "typia/lib/internal/_validateReport";
import * as __typia_transform__createStandardSchema from "typia/lib/internal/_createStandardSchema";
// drone-controller.ts
/**
 * High-level drone controller:
 *  - Uses DroneStateModel (subscriptions handled there) to read vehicle state
 *  - Uses ros2Bridge to publish MAVROS setpoints and call MAVROS services
 *  - No ACK system
 *  - Requested/target state with optional automatic enforcement (tick every second)
 */
import * as RosTypes from "../../ros/ros-types.js";
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
    LANDING = 4
}
export type TargetAutoState = null | {
    kind: "landed";
    armed: boolean | null;
} | {
    kind: "airborne";
    altMeters: number;
    yawRad?: number;
} | {
    kind: "offboard";
    target: OffboardTarget;
};
export type OffboardTarget = {
    kind: "position_local";
    x: number;
    y: number;
    z: number;
    yawRad?: number;
} | {
    kind: "velocity_local";
    vx: number;
    vy: number;
    vz: number;
    yawRate?: number;
} | {
    kind: "raw_local";
    coordinate_frame: number;
    type_mask: number;
    position?: {
        x: number;
        y: number;
        z: number;
    };
    velocity?: {
        x: number;
        y: number;
        z: number;
    };
    acceleration_or_force?: {
        x: number;
        y: number;
        z: number;
    };
    yaw?: number;
    yaw_rate?: number;
} | {
    kind: "raw_attitude";
    type_mask: number;
    orientation?: {
        x: number;
        y: number;
        z: number;
        w: number;
    };
    body_rate?: {
        x: number;
        y: number;
        z: number;
    };
    thrust?: number;
};
const _validateTargetAutoState = (() => { const _io0 = (input: any): boolean => "landed" === input.kind && (null === input.armed || "boolean" === typeof input.armed); const _io1 = (input: any): boolean => "airborne" === input.kind && "number" === typeof input.altMeters && (undefined === input.yawRad || "number" === typeof input.yawRad); const _io2 = (input: any): boolean => "offboard" === input.kind && ("object" === typeof input.target && null !== input.target && _iu0(input.target)); const _io3 = (input: any): boolean => "position_local" === input.kind && "number" === typeof input.x && "number" === typeof input.y && "number" === typeof input.z && (undefined === input.yawRad || "number" === typeof input.yawRad); const _io4 = (input: any): boolean => "velocity_local" === input.kind && "number" === typeof input.vx && "number" === typeof input.vy && "number" === typeof input.vz && (undefined === input.yawRate || "number" === typeof input.yawRate); const _io5 = (input: any): boolean => "raw_local" === input.kind && "number" === typeof input.coordinate_frame && "number" === typeof input.type_mask && (undefined === input.position || "object" === typeof input.position && null !== input.position && _io6(input.position)) && (undefined === input.velocity || "object" === typeof input.velocity && null !== input.velocity && _io7(input.velocity)) && (undefined === input.acceleration_or_force || "object" === typeof input.acceleration_or_force && null !== input.acceleration_or_force && _io8(input.acceleration_or_force)) && (undefined === input.yaw || "number" === typeof input.yaw) && (undefined === input.yaw_rate || "number" === typeof input.yaw_rate); const _io6 = (input: any): boolean => "number" === typeof input.x && "number" === typeof input.y && "number" === typeof input.z; const _io7 = (input: any): boolean => "number" === typeof input.x && "number" === typeof input.y && "number" === typeof input.z; const _io8 = (input: any): boolean => "number" === typeof input.x && "number" === typeof input.y && "number" === typeof input.z; const _io9 = (input: any): boolean => "raw_attitude" === input.kind && "number" === typeof input.type_mask && (undefined === input.orientation || "object" === typeof input.orientation && null !== input.orientation && _io10(input.orientation)) && (undefined === input.body_rate || "object" === typeof input.body_rate && null !== input.body_rate && _io11(input.body_rate)) && (undefined === input.thrust || "number" === typeof input.thrust); const _io10 = (input: any): boolean => "number" === typeof input.x && "number" === typeof input.y && "number" === typeof input.z && "number" === typeof input.w; const _io11 = (input: any): boolean => "number" === typeof input.x && "number" === typeof input.y && "number" === typeof input.z; const _iu0 = (input: any): any => (() => {
    if ("position_local" === input.kind)
        return _io3(input);
    else if ("velocity_local" === input.kind)
        return _io4(input);
    else if ("raw_local" === input.kind)
        return _io5(input);
    else if ("raw_attitude" === input.kind)
        return _io9(input);
    else
        return false;
})(); const _iu1 = (input: any): any => (() => {
    if ("landed" === input.kind)
        return _io0(input);
    else if ("airborne" === input.kind)
        return _io1(input);
    else if ("offboard" === input.kind)
        return _io2(input);
    else
        return false;
})(); const _vo0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["landed" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"landed\"",
        value: input.kind
    }), null === input.armed || "boolean" === typeof input.armed || _report(_exceptionable, {
        path: _path + ".armed",
        expected: "(boolean | null)",
        value: input.armed
    })].every((flag: boolean) => flag); const _vo1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["airborne" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"airborne\"",
        value: input.kind
    }), "number" === typeof input.altMeters || _report(_exceptionable, {
        path: _path + ".altMeters",
        expected: "number",
        value: input.altMeters
    }), undefined === input.yawRad || "number" === typeof input.yawRad || _report(_exceptionable, {
        path: _path + ".yawRad",
        expected: "(number | undefined)",
        value: input.yawRad
    })].every((flag: boolean) => flag); const _vo2 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["offboard" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"offboard\"",
        value: input.kind
    }), ("object" === typeof input.target && null !== input.target || _report(_exceptionable, {
        path: _path + ".target",
        expected: "(__type.o3 | __type.o4 | __type.o5 | __type.o9)",
        value: input.target
    })) && _vu0(input.target, _path + ".target", true && _exceptionable) || _report(_exceptionable, {
        path: _path + ".target",
        expected: "(__type.o3 | __type.o4 | __type.o5 | __type.o9)",
        value: input.target
    })].every((flag: boolean) => flag); const _vo3 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["position_local" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"position_local\"",
        value: input.kind
    }), "number" === typeof input.x || _report(_exceptionable, {
        path: _path + ".x",
        expected: "number",
        value: input.x
    }), "number" === typeof input.y || _report(_exceptionable, {
        path: _path + ".y",
        expected: "number",
        value: input.y
    }), "number" === typeof input.z || _report(_exceptionable, {
        path: _path + ".z",
        expected: "number",
        value: input.z
    }), undefined === input.yawRad || "number" === typeof input.yawRad || _report(_exceptionable, {
        path: _path + ".yawRad",
        expected: "(number | undefined)",
        value: input.yawRad
    })].every((flag: boolean) => flag); const _vo4 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["velocity_local" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"velocity_local\"",
        value: input.kind
    }), "number" === typeof input.vx || _report(_exceptionable, {
        path: _path + ".vx",
        expected: "number",
        value: input.vx
    }), "number" === typeof input.vy || _report(_exceptionable, {
        path: _path + ".vy",
        expected: "number",
        value: input.vy
    }), "number" === typeof input.vz || _report(_exceptionable, {
        path: _path + ".vz",
        expected: "number",
        value: input.vz
    }), undefined === input.yawRate || "number" === typeof input.yawRate || _report(_exceptionable, {
        path: _path + ".yawRate",
        expected: "(number | undefined)",
        value: input.yawRate
    })].every((flag: boolean) => flag); const _vo5 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["raw_local" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"raw_local\"",
        value: input.kind
    }), "number" === typeof input.coordinate_frame || _report(_exceptionable, {
        path: _path + ".coordinate_frame",
        expected: "number",
        value: input.coordinate_frame
    }), "number" === typeof input.type_mask || _report(_exceptionable, {
        path: _path + ".type_mask",
        expected: "number",
        value: input.type_mask
    }), undefined === input.position || ("object" === typeof input.position && null !== input.position || _report(_exceptionable, {
        path: _path + ".position",
        expected: "(__type.o6 | undefined)",
        value: input.position
    })) && _vo6(input.position, _path + ".position", true && _exceptionable) || _report(_exceptionable, {
        path: _path + ".position",
        expected: "(__type.o6 | undefined)",
        value: input.position
    }), undefined === input.velocity || ("object" === typeof input.velocity && null !== input.velocity || _report(_exceptionable, {
        path: _path + ".velocity",
        expected: "(__type.o7 | undefined)",
        value: input.velocity
    })) && _vo7(input.velocity, _path + ".velocity", true && _exceptionable) || _report(_exceptionable, {
        path: _path + ".velocity",
        expected: "(__type.o7 | undefined)",
        value: input.velocity
    }), undefined === input.acceleration_or_force || ("object" === typeof input.acceleration_or_force && null !== input.acceleration_or_force || _report(_exceptionable, {
        path: _path + ".acceleration_or_force",
        expected: "(__type.o8 | undefined)",
        value: input.acceleration_or_force
    })) && _vo8(input.acceleration_or_force, _path + ".acceleration_or_force", true && _exceptionable) || _report(_exceptionable, {
        path: _path + ".acceleration_or_force",
        expected: "(__type.o8 | undefined)",
        value: input.acceleration_or_force
    }), undefined === input.yaw || "number" === typeof input.yaw || _report(_exceptionable, {
        path: _path + ".yaw",
        expected: "(number | undefined)",
        value: input.yaw
    }), undefined === input.yaw_rate || "number" === typeof input.yaw_rate || _report(_exceptionable, {
        path: _path + ".yaw_rate",
        expected: "(number | undefined)",
        value: input.yaw_rate
    })].every((flag: boolean) => flag); const _vo6 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["number" === typeof input.x || _report(_exceptionable, {
        path: _path + ".x",
        expected: "number",
        value: input.x
    }), "number" === typeof input.y || _report(_exceptionable, {
        path: _path + ".y",
        expected: "number",
        value: input.y
    }), "number" === typeof input.z || _report(_exceptionable, {
        path: _path + ".z",
        expected: "number",
        value: input.z
    })].every((flag: boolean) => flag); const _vo7 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["number" === typeof input.x || _report(_exceptionable, {
        path: _path + ".x",
        expected: "number",
        value: input.x
    }), "number" === typeof input.y || _report(_exceptionable, {
        path: _path + ".y",
        expected: "number",
        value: input.y
    }), "number" === typeof input.z || _report(_exceptionable, {
        path: _path + ".z",
        expected: "number",
        value: input.z
    })].every((flag: boolean) => flag); const _vo8 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["number" === typeof input.x || _report(_exceptionable, {
        path: _path + ".x",
        expected: "number",
        value: input.x
    }), "number" === typeof input.y || _report(_exceptionable, {
        path: _path + ".y",
        expected: "number",
        value: input.y
    }), "number" === typeof input.z || _report(_exceptionable, {
        path: _path + ".z",
        expected: "number",
        value: input.z
    })].every((flag: boolean) => flag); const _vo9 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["raw_attitude" === input.kind || _report(_exceptionable, {
        path: _path + ".kind",
        expected: "\"raw_attitude\"",
        value: input.kind
    }), "number" === typeof input.type_mask || _report(_exceptionable, {
        path: _path + ".type_mask",
        expected: "number",
        value: input.type_mask
    }), undefined === input.orientation || ("object" === typeof input.orientation && null !== input.orientation || _report(_exceptionable, {
        path: _path + ".orientation",
        expected: "(__type.o10 | undefined)",
        value: input.orientation
    })) && _vo10(input.orientation, _path + ".orientation", true && _exceptionable) || _report(_exceptionable, {
        path: _path + ".orientation",
        expected: "(__type.o10 | undefined)",
        value: input.orientation
    }), undefined === input.body_rate || ("object" === typeof input.body_rate && null !== input.body_rate || _report(_exceptionable, {
        path: _path + ".body_rate",
        expected: "(__type.o11 | undefined)",
        value: input.body_rate
    })) && _vo11(input.body_rate, _path + ".body_rate", true && _exceptionable) || _report(_exceptionable, {
        path: _path + ".body_rate",
        expected: "(__type.o11 | undefined)",
        value: input.body_rate
    }), undefined === input.thrust || "number" === typeof input.thrust || _report(_exceptionable, {
        path: _path + ".thrust",
        expected: "(number | undefined)",
        value: input.thrust
    })].every((flag: boolean) => flag); const _vo10 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["number" === typeof input.x || _report(_exceptionable, {
        path: _path + ".x",
        expected: "number",
        value: input.x
    }), "number" === typeof input.y || _report(_exceptionable, {
        path: _path + ".y",
        expected: "number",
        value: input.y
    }), "number" === typeof input.z || _report(_exceptionable, {
        path: _path + ".z",
        expected: "number",
        value: input.z
    }), "number" === typeof input.w || _report(_exceptionable, {
        path: _path + ".w",
        expected: "number",
        value: input.w
    })].every((flag: boolean) => flag); const _vo11 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ["number" === typeof input.x || _report(_exceptionable, {
        path: _path + ".x",
        expected: "number",
        value: input.x
    }), "number" === typeof input.y || _report(_exceptionable, {
        path: _path + ".y",
        expected: "number",
        value: input.y
    }), "number" === typeof input.z || _report(_exceptionable, {
        path: _path + ".z",
        expected: "number",
        value: input.z
    })].every((flag: boolean) => flag); const _vu0 = (input: any, _path: string, _exceptionable: boolean = true): any => (() => {
    if ("position_local" === input.kind)
        return _vo3(input, _path, true && _exceptionable);
    else if ("velocity_local" === input.kind)
        return _vo4(input, _path, true && _exceptionable);
    else if ("raw_local" === input.kind)
        return _vo5(input, _path, true && _exceptionable);
    else if ("raw_attitude" === input.kind)
        return _vo9(input, _path, true && _exceptionable);
    else
        return _report(_exceptionable, {
            path: _path,
            expected: "(__type.o3 | __type.o4 | __type.o5 | __type.o9)",
            value: input
        });
})(); const _vu1 = (input: any, _path: string, _exceptionable: boolean = true): any => (() => {
    if ("landed" === input.kind)
        return _vo0(input, _path, true && _exceptionable);
    else if ("airborne" === input.kind)
        return _vo1(input, _path, true && _exceptionable);
    else if ("offboard" === input.kind)
        return _vo2(input, _path, true && _exceptionable);
    else
        return _report(_exceptionable, {
            path: _path,
            expected: "(__type | __type.o1 | __type.o2)",
            value: input
        });
})(); const __is = (input: any): input is TargetAutoState => null === input || "object" === typeof input && null !== input && _iu1(input); let errors: any; let _report: any; return __typia_transform__createStandardSchema._createStandardSchema((input: any): import("typia").IValidation<TargetAutoState> => {
    if (false === __is(input)) {
        errors = [];
        _report = (__typia_transform__validateReport._validateReport as any)(errors);
        ((input: any, _path: string, _exceptionable: boolean = true) => null === input || ("object" === typeof input && null !== input || _report(true, {
            path: _path + "",
            expected: "(__type | __type.o1 | __type.o2 | null)",
            value: input
        })) && _vu1(input, _path + "", true) || _report(true, {
            path: _path + "",
            expected: "(__type | __type.o1 | __type.o2 | null)",
            value: input
        }))(input, "$input", true);
        const success = 0 === errors.length;
        return success ? {
            success,
            data: input
        } : {
            success,
            errors,
            data: input
        } as any;
    }
    return {
        success: true,
        data: input
    } as any;
}); })();
export function validateTargetAutoState(input: unknown): typia.IValidation<TargetAutoState> {
    return _validateTargetAutoState(input);
}
export function assertTargetAutoState(input: unknown): TargetAutoState {
    const result = validateTargetAutoState(input);
    if (result.success) {
        return result.data;
    }
    throw new Error(result.errors
        .map((e) => `${e.path}: expected ${e.expected}, got ${JSON.stringify(e.value)}`)
        .join("\n"));
}
export interface DroneControllerOptions {
    localFrameId?: string; // default "map"
    minBatteryForFlight?: number; // default 0.15
    autoStateManagement?: boolean; // default false
    stateManagementIntervalMs?: number; // default 1000
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
        };
        this.model.onUpdate((s: Partial<DroneState>) => { this.latestState = s; });
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
        await this._requireConnected();
        logger.info("[DRONE_CONTROLLER] Sending disarm command...");
        const result = await this.mavrosArmDisarm(false);
        logger.info("[DRONE_CONTROLLER] Disarm command result:", result);
    }
    async setMode(mode: string, base = 0, debug = true): Promise<void> {
        await this._requireConnected();
        if (debug) {
            logger.info(`[DRONE_CONTROLLER] Setting mode to ${mode} (base=${base})...`);
        }
        const result = await this.mavrosSetMode(mode, base);
        if (debug) {
            logger.info("[DRONE_CONTROLLER] Set mode result:", result);
        }
    }
    async takeoff(altMeters: number = 3, yawRad = 0): Promise<void> {
        await this.arm();
        const gp = (await this.model.getState()).global_position_int;
        if (!gp)
            throw new Error("No GPS fix");
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
        await this._requireConnected();
        logger.info("[DRONE_CONTROLLER] Sending land command...");
        const result = await this.mavrosLand();
        logger.info("[DRONE_CONTROLLER] Land command result:", result);
    }
    async rtl(): Promise<void> {
        await this._requireConnected();
        logger.info("[DRONE_CONTROLLER] Sending return-to-launch (RTL) command...");
        const result = await this.mavrosSetMode("AUTO.RTL", 0);
        logger.info("[DRONE_CONTROLLER] RTL command result:", result);
    }
    // -------- Requested state / auto state management --------
    public async requestAutoState(state: TargetAutoState): Promise<void> {
        const targetState = assertTargetAutoState(state);
        this._targetAutoState = structuredClone(targetState);
        if (targetState) {
            await this.waitForStateReady();
            await this._tickAutoState();
            while (deepEqual(this._targetAutoState, targetState) && !this.isInRequestedAutoState()) {
                await this.sleep(100);
            }
            logger.info("[DRONE_CONTROLLER] Target auto state reached:\n", targetState);
        }
        else {
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
    public clearAutoState(): void {
        this.requestAutoState(null);
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
        if (debug) {
            logger.debug("[AUTO_STATE] Requested :", this.targetAutoState, "\nCurrent state :", { extended: currentState.extended, vehicle: currentState.vehicle });
        }
        switch (this.targetAutoState?.kind) {
            case undefined:
                return true;
            case "landed": {
                return landed && (this.targetAutoState.armed === null || this.targetAutoState.armed === currentState.vehicle?.armed);
            }
            case "airborne": {
                return (currentState.vehicle?.armed && !(landed || landing || takingOff || onGround)) ?? false;
            }
            case "offboard": {
                // TODO : add offboard target checks
                if (!(currentState.vehicle?.armed && offboard)) {
                    return false;
                }
                const offboardTarget = this.targetAutoState.target;
                switch (offboardTarget.kind) {
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
    private async _tickAutoState(): Promise<void> {
        if (!this.targetAutoState)
            return;
        if (this.targetAutoState.kind === "offboard") {
            // Offboard has it's own ticker.
            return;
        }
        if (this.stateManagerTickRunning)
            return;
        this.stateManagerTickRunning = true;
        logger.debug(`[AUTO_STATE] Tick: targetAutoState=${JSON.stringify(this.targetAutoState)}`);
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
            switch (this.targetAutoState.kind) {
                case "landed": {
                    // We need the drone landed.
                    if (landing) {
                        return;
                    }
                    if (landed) {
                        // FIXME: TargetAutoState type allows armed: boolean | null for "landed" state, where null likely means "don't change arm state".
                        // However, when armed is null, the comparison this.targetAutoState.armed != currentState.vehicle?.armed is always true (since null != true and null != false),
                        // and the subsequent if(this.targetAutoState.armed) check treats null as falsy, causing an unintended disarm command regardless of current state.
                        // Do we want to disarm?
                        if (this.targetAutoState.armed != currentState.vehicle?.armed) {
                            // We need to change the arm state.
                            if (this.targetAutoState.armed) {
                                logger.info('[AUTO_STATE] Requesting drone arm');
                                await this.arm();
                            }
                            else {
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
                        return;
                    }
                    return;
                }
                case "airborne": {
                    let requestedAltitude = this.targetAutoState.altMeters;
                    if (landed) {
                        logger.info("[AUTO_STATE] Processing airborne state [landed = true]. Requesting takeoff");
                        await this.takeoff(requestedAltitude);
                        return;
                    }
                    if (landing) {
                        logger.info("[AUTO_STATE] Processing airborne state [landing = true]. Requesting takeoff");
                        await this.takeoff(requestedAltitude);
                        return;
                    }
                    if (takingOff) {
                        logger.info("[AUTO_STATE] Processing airborne state [takingoff = true]. Doing nothing");
                        return;
                    }
                    if (currentState.vehicle?.mode != "AUTO.LOITER") {
                        // TODO : add more checks.
                        logger.info("[AUTO_STATE] airborne requested. vehicle mode not in AUTO.LOTIER mode. Setting it to AUTO.LOTIER");
                        await this.setMode("AUTO.LOITER");
                    }
                    return;
                }
            }
        }
        catch (e) {
            logger.error(`[AUTO_STATE] Error in tick: ${e instanceof Error ? e.message : String(e)}`);
        }
        finally {
            this.stateManagerTickRunning = false;
        }
    }
    // -------- OFFBOARD --------
    private startOffboardLoop(): void {
        if (this.offboardInterval !== null)
            return;
        this.offboardInterval = setInterval(() => {
            void this._tickOffboard();
        }, 50);
    }
    private async _tickOffboard(): Promise<void> {
        const offboardTarget = this.targetAutoState?.kind === "offboard" ? this.targetAutoState.target : undefined;
        if (!offboardTarget)
            return;
        if (this.offboardTickRunning)
            return;
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
            if (!armed) {
                await this.arm();
            }
            if (!isOffboard) {
                await this.setMode("OFFBOARD", 0, false);
            }
            this.publishOffboardTarget(offboardTarget);
        }
        finally {
            this.offboardTickRunning = false;
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
        const nanosec = (now - sec * 1000) * 1000000;
        return { sec, nanosec };
    }
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
