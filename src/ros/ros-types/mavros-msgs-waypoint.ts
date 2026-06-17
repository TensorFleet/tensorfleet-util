import type { StdHeader } from "./common.js";

/** mavros_msgs/msg/Waypoint */
export interface MavrosMsgsWaypoint {
  /** MAVLink coordinate frame used to interpret position and altitude values. */
  frame: number;

  /** MAVLink command number, such as go-to, takeoff, land, or return-to-launch. */
  command: number;

  /** Whether this item is currently selected as the active mission item. */
  is_current: boolean;

  /** Whether execution should automatically continue to the next mission item. */
  autocontinue: boolean;

  /** Command-specific value. Its meaning depends on `command`. */
  param1: number;

  /** Command-specific value. Its meaning depends on `command`. */
  param2: number;

  /** Command-specific value. Its meaning depends on `command`. */
  param3: number;

  /** Command-specific yaw value in degrees, or `NaN` when unspecified. */
  param4: number;

  /** Target latitude in degrees for commands that use a global position. */
  x_lat: number;

  /** Target longitude in degrees for commands that use a global position. */
  y_long: number;

  /** Target altitude interpreted according to `frame`. */
  z_alt: number;
}

/** mavros_msgs/msg/WaypointList */
export interface MavrosMsgsWaypointList {
  /** Zero-based index of the currently active mission item. */
  current_seq: number;

  /** Mission items in execution order. */
  waypoints: MavrosMsgsWaypoint[];
}

/** mavros_msgs/msg/WaypointReached */
export interface MavrosMsgsWaypointReached {
  /** ROS message timestamp and frame information. */
  header: StdHeader;

  /** Zero-based index of the mission item that was reached. */
  wp_seq: number;
}

/** mavros_msgs/srv/WaypointPush */
export interface WaypointPush_Request {
  /**
   * Zero-based index at which the supplied items should be written.
   * Use `0` when replacing the complete mission.
   */
  start_index: number;

  /** Mission items to upload, in execution order. */
  waypoints: MavrosMsgsWaypoint[];
}

export interface WaypointPush_Response {
  /** Whether MAVROS completed the upload successfully. */
  success: boolean;

  /**
   * Number of mission items transferred.
   * `wp_transfered` is the spelling used by MAVROS.
   */
  wp_transfered: number;
}

/** mavros_msgs/srv/WaypointPull */
export interface WaypointPull_Request {}

export interface WaypointPull_Response {
  /** Whether MAVROS completed the read successfully. */
  success: boolean;

  /** Number of mission items received from the vehicle. */
  wp_received: number;
}

/** mavros_msgs/srv/WaypointClear */
export interface WaypointClear_Request {}

export interface WaypointClear_Response {
  /** Whether the stored mission was cleared successfully. */
  success: boolean;
}

/** mavros_msgs/srv/WaypointSetCurrent */
export interface WaypointSetCurrent_Request {
  /** Zero-based index of the mission item to make current. */
  wp_seq: number;
}

export interface WaypointSetCurrent_Response {
  /** Whether the current mission item was changed successfully. */
  success: boolean;
}

/** Coordinate frame used for mission position and altitude values. */
export enum MavrosMissionFrame {
  /** Global latitude/longitude with altitude above mean sea level. */
  GLOBAL = 0,

  /** Global latitude/longitude with altitude relative to the home altitude. */
  GLOBAL_RELATIVE_ALT = 3,

  /** Global latitude/longitude with altitude relative to terrain. */
  GLOBAL_TERRAIN_ALT = 10,
}

/** Mission commands supported by `MavrosMissionWaypoint`. */
export enum MavrosMissionCommand {
  /** Fly to the supplied latitude, longitude, and altitude. */
  GO_TO = 16,

  /** Return using the controller's configured return-to-launch behavior. */
  RETURN_TO_LAUNCH = 20,

  /** Land at the supplied latitude and longitude. */
  LAND = 21,

  /** Take off to the supplied altitude. */
  TAKEOFF = 22,
}

/** Precision-landing behavior requested by a land mission item. */
export enum MavrosPrecisionLandMode {
  /** Do not require precision landing. */
  DISABLED = 0,

  /** Use precision landing when it is available. */
  OPPORTUNISTIC = 1,

  /** Require precision landing. */
  REQUIRED = 2,
}

/** Additional takeoff behavior flags. */
export enum MavrosTakeoffFlags {
  /** No additional takeoff behavior. */
  NONE = 0,

  /** The takeoff command does not require a horizontal position target. */
  HORIZONTAL_POSITION_NOT_REQUIRED = 1,
}

/** Values shared by all supported mission item inputs. */
export interface MavrosMissionItemBase {
  /**
   * Coordinate frame used for position and altitude.
   * Defaults to `GLOBAL_RELATIVE_ALT`.
   */
  frame?: MavrosMissionFrame;

  /** Whether this item should initially be marked as current. */
  isCurrent?: boolean;

  /**
   * Whether the controller should automatically continue to the next item.
   * Defaults to `true`.
   */
  autocontinue?: boolean;
}

/** Input for a go-to mission item. */
export interface MavrosMissionGoTo extends MavrosMissionItemBase {
  command: MavrosMissionCommand.GO_TO;

  /** Target latitude in degrees. */
  latitude: number;

  /** Target longitude in degrees. */
  longitude: number;

  /** Target altitude interpreted according to `frame`. */
  altitude: number;

  /** Time to remain at the target before continuing, in seconds. */
  holdSeconds?: number;

  /** Distance from the target at which it may be considered reached, in meters. */
  acceptanceRadiusMeters?: number;

  /**
   * Pass-through radius in meters.
   * `0` means stop at the target instead of passing through it.
   */
  passRadiusMeters?: number;

  /** Requested yaw in degrees, or `null` to leave yaw unspecified. */
  yawDegrees?: number | null;
}

/** Input for a takeoff mission item. */
export interface MavrosMissionTakeoff extends MavrosMissionItemBase {
  command: MavrosMissionCommand.TAKEOFF;

  /** Takeoff latitude in degrees. */
  latitude: number;

  /** Takeoff longitude in degrees. */
  longitude: number;

  /** Target takeoff altitude interpreted according to `frame`. */
  altitude: number;

  /** Minimum requested pitch during takeoff, in degrees. */
  minimumPitchDegrees?: number;

  /** Additional takeoff behavior flags. */
  flags?: MavrosTakeoffFlags;

  /** Requested yaw in degrees, or `null` to leave yaw unspecified. */
  yawDegrees?: number | null;
}

/** Input for a land mission item. */
export interface MavrosMissionLand extends MavrosMissionItemBase {
  command: MavrosMissionCommand.LAND;

  /** Landing latitude in degrees. */
  latitude: number;

  /** Landing longitude in degrees. */
  longitude: number;

  /**
   * Landing altitude interpreted according to `frame`.
   * Defaults to `0`.
   */
  altitude?: number;

  /** Altitude at which an aborted landing should stop descending, in meters. */
  abortAltitudeMeters?: number;

  /** Requested precision-landing behavior. */
  precisionLandMode?: MavrosPrecisionLandMode;

  /** Requested landing yaw in degrees, or `null` to leave yaw unspecified. */
  yawDegrees?: number | null;
}

/** Input for a return-to-launch mission item. */
export interface MavrosMissionReturnToLaunch
    extends MavrosMissionItemBase {
  command: MavrosMissionCommand.RETURN_TO_LAUNCH;
}

/** Supported constructor inputs for `MavrosMissionWaypoint`. */
export type MavrosMissionWaypointInput =
    | MavrosMissionGoTo
    | MavrosMissionTakeoff
    | MavrosMissionLand
    | MavrosMissionReturnToLaunch;

export class MavrosMissionWaypoint implements MavrosMsgsWaypoint {
  /** Numeric coordinate-frame value sent to MAVROS. */
  public readonly frame: number;

  /** Numeric mission-command value sent to MAVROS. */
  public readonly command: number;

  /** MAVROS field indicating whether this item is currently active. */
  public readonly is_current: boolean;

  /** MAVROS field controlling automatic continuation. */
  public readonly autocontinue: boolean;

  /** Command-specific MAVROS parameter generated from the constructor input. */
  public readonly param1: number;

  /** Command-specific MAVROS parameter generated from the constructor input. */
  public readonly param2: number;

  /** Command-specific MAVROS parameter generated from the constructor input. */
  public readonly param3: number;

  /** Command-specific yaw value generated from the constructor input. */
  public readonly param4: number;

  /** MAVROS latitude field. */
  public readonly x_lat: number;

  /** MAVROS longitude field. */
  public readonly y_long: number;

  /** MAVROS altitude field. */
  public readonly z_alt: number;

  constructor(input: MavrosMissionWaypointInput) {
    const frame =
        input.frame ?? MavrosMissionFrame.GLOBAL_RELATIVE_ALT;

    let param1 = 0;
    let param2 = 0;
    let param3 = 0;
    let param4 = 0;
    let latitude = 0;
    let longitude = 0;
    let altitude = 0;

    switch (input.command) {
      case MavrosMissionCommand.GO_TO:
        MavrosMissionWaypoint.assertLocation(
            input.latitude,
            input.longitude,
            input.altitude,
        );

        // GO_TO parameter mapping:
        // param1: hold time in seconds
        // param2: acceptance radius in meters
        // param3: pass-through radius in meters
        // param4: yaw in degrees
        param1 = input.holdSeconds ?? 0;
        param2 = input.acceptanceRadiusMeters ?? 0;
        param3 = input.passRadiusMeters ?? 0;
        param4 = input.yawDegrees ?? Number.NaN;

        latitude = input.latitude;
        longitude = input.longitude;
        altitude = input.altitude;
        break;

      case MavrosMissionCommand.TAKEOFF:
        MavrosMissionWaypoint.assertLocation(
            input.latitude,
            input.longitude,
            input.altitude,
        );

        // TAKEOFF parameter mapping:
        // param1: minimum pitch in degrees
        // param2: unused
        // param3: takeoff flags
        // param4: yaw in degrees
        param1 = input.minimumPitchDegrees ?? 0;
        param2 = 0;
        param3 = input.flags ?? MavrosTakeoffFlags.NONE;
        param4 = input.yawDegrees ?? Number.NaN;

        latitude = input.latitude;
        longitude = input.longitude;
        altitude = input.altitude;
        break;

      case MavrosMissionCommand.LAND:
        MavrosMissionWaypoint.assertLocation(
            input.latitude,
            input.longitude,
            input.altitude ?? 0,
        );

        // LAND parameter mapping:
        // param1: abort altitude in meters
        // param2: precision-landing mode
        // param3: unused
        // param4: yaw in degrees
        param1 = input.abortAltitudeMeters ?? 0;
        param2 =
            input.precisionLandMode ??
            MavrosPrecisionLandMode.DISABLED;
        param3 = 0;
        param4 = input.yawDegrees ?? Number.NaN;

        latitude = input.latitude;
        longitude = input.longitude;
        altitude = input.altitude ?? 0;
        break;

      case MavrosMissionCommand.RETURN_TO_LAUNCH:
        // RETURN_TO_LAUNCH does not use a target location or parameters.
        param1 = 0;
        param2 = 0;
        param3 = 0;
        param4 = 0;
        latitude = 0;
        longitude = 0;
        altitude = 0;
        break;

      default:
        throw new Error(
            `Unsupported mission command: ${String(input)}`,
        );
    }

    this.frame = frame;
    this.command = input.command;
    this.is_current = input.isCurrent ?? false;
    this.autocontinue = input.autocontinue ?? true;
    this.param1 = param1;
    this.param2 = param2;
    this.param3 = param3;
    this.param4 = param4;
    this.x_lat = latitude;
    this.y_long = longitude;
    this.z_alt = altitude;
  }

  private static assertLocation(
      latitude: number,
      longitude: number,
      altitude: number,
  ): void {
    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
    ) {
      throw new Error(`Invalid latitude: ${latitude}`);
    }

    if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
      throw new Error(`Invalid longitude: ${longitude}`);
    }

    if (!Number.isFinite(altitude)) {
      throw new Error(`Invalid altitude: ${altitude}`);
    }
  }
}