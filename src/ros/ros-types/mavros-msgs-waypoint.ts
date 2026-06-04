/** mavros_msgs/msg/Waypoint */
export interface MavrosMsgsWaypoint {
  frame: number;
  command: number;
  is_current: boolean;
  autocontinue: boolean;
  param1: number;
  param2: number;
  param3: number;
  param4: number;
  x_lat: number;
  y_long: number;
  z_alt: number;
}

export enum MavrosWaypointFrame {
  GLOBAL = 0,
  GLOBAL_REL_ALT = 3,
  GLOBAL_TERRAIN_ALT = 10,
}

export enum MavrosMissionCommand {
  WAYPOINT = 16,
  RETURN_TO_LAUNCH = 20,
  LAND = 21,
  TAKEOFF = 22,
}

export type MavrosMissionPoint = {
  lat: number;
  lon: number;
  alt: number;
};

export type MavrosWaypointBehavior = {
  frame?: MavrosWaypointFrame;
  isCurrent?: boolean;
  autocontinue?: boolean;
};

export type MavrosGoToPointOptions = MavrosWaypointBehavior & {
  holdSeconds?: number;
  acceptanceRadiusMeters?: number;
  passRadiusMeters?: number;
  yawDegrees?: number | null;
};

export type MavrosTakeoffOptions = MavrosWaypointBehavior & {
  yawDegrees?: number | null;
};

export type MavrosLandOptions = MavrosWaypointBehavior & {
  yawDegrees?: number | null;
};

export class MavrosMissionWaypoint {
  private static readonly DEFAULT_FRAME = MavrosWaypointFrame.GLOBAL_REL_ALT;

  private constructor() {}

  static goToPoint(
      point: MavrosMissionPoint,
      options: MavrosGoToPointOptions = {},
  ): MavrosMsgsWaypoint {
    return this.build({
      command: MavrosMissionCommand.WAYPOINT,
      point,
      frame: options.frame,
      isCurrent: options.isCurrent,
      autocontinue: options.autocontinue,

      holdSeconds: options.holdSeconds,
      acceptanceRadiusMeters: options.acceptanceRadiusMeters,
      passRadiusMeters: options.passRadiusMeters,
      yawDegrees: options.yawDegrees,
    });
  }

  static takeoff(
      point: MavrosMissionPoint,
      options: MavrosTakeoffOptions = {},
  ): MavrosMsgsWaypoint {
    return this.build({
      command: MavrosMissionCommand.TAKEOFF,
      point,
      frame: options.frame,
      isCurrent: options.isCurrent,
      autocontinue: options.autocontinue,
      yawDegrees: options.yawDegrees,
    });
  }

  static land(
      point: MavrosMissionPoint,
      options: MavrosLandOptions = {},
  ): MavrosMsgsWaypoint {
    return this.build({
      command: MavrosMissionCommand.LAND,
      point: {
        lat: point.lat,
        lon: point.lon,
        alt: point.alt,
      },
      frame: options.frame,
      isCurrent: options.isCurrent,
      autocontinue: options.autocontinue,
      yawDegrees: options.yawDegrees,
    });
  }

  static returnToLaunch(
      options: MavrosWaypointBehavior = {},
  ): MavrosMsgsWaypoint {
    return this.build({
      command: MavrosMissionCommand.RETURN_TO_LAUNCH,
      point: {
        lat: 0,
        lon: 0,
        alt: 0,
      },
      frame: options.frame,
      isCurrent: options.isCurrent,
      autocontinue: options.autocontinue,
    });
  }

  static goToPoints(
      points: MavrosMissionPoint[],
      options: MavrosGoToPointOptions = {},
  ): MavrosMsgsWaypoint[] {
    return points.map((point, index) =>
        this.goToPoint(point, {
          ...options,
          isCurrent: index === 0,
        }),
    );
  }

  static takeoffThenGoToPointsThenLand(input: {
    takeoff: MavrosMissionPoint;
    points: MavrosMissionPoint[];
    landAt?: MavrosMissionPoint;
    takeoffOptions?: MavrosTakeoffOptions;
    waypointOptions?: MavrosGoToPointOptions;
    landOptions?: MavrosLandOptions;
  }): MavrosMsgsWaypoint[] {
    const landingPoint =
        input.landAt ?? input.points[input.points.length - 1];

    if (!landingPoint) {
      throw new Error("Cannot create landing mission without a landing point");
    }

    return [
      this.takeoff(input.takeoff, {
        ...input.takeoffOptions,
        isCurrent: true,
      }),

      ...input.points.map((point) =>
          this.goToPoint(point, {
            ...input.waypointOptions,
            isCurrent: false,
          }),
      ),

      this.land(landingPoint, {
        ...input.landOptions,
        isCurrent: false,
      }),
    ];
  }

  private static build(input: {
    command: MavrosMissionCommand;
    point: MavrosMissionPoint;
    frame?: MavrosWaypointFrame;
    isCurrent?: boolean;
    autocontinue?: boolean;

    holdSeconds?: number;
    acceptanceRadiusMeters?: number;
    passRadiusMeters?: number;
    yawDegrees?: number | null;
  }): MavrosMsgsWaypoint {
    const frame = input.frame ?? this.DEFAULT_FRAME;

    this.assertSupportedFrame(frame);
    this.assertPoint(input.point);

    return {
      frame,
      command: input.command,
      is_current: input.isCurrent ?? false,
      autocontinue: input.autocontinue ?? true,

      param1: input.holdSeconds ?? 0,
      param2: input.acceptanceRadiusMeters ?? 0,
      param3: input.passRadiusMeters ?? 0,
      param4: input.yawDegrees ?? Number.NaN,

      x_lat: input.point.lat,
      y_long: input.point.lon,
      z_alt: input.point.alt,
    };
  }

  private static assertSupportedFrame(frame: MavrosWaypointFrame): void {
    switch (frame) {
      case MavrosWaypointFrame.GLOBAL:
      case MavrosWaypointFrame.GLOBAL_REL_ALT:
      case MavrosWaypointFrame.GLOBAL_TERRAIN_ALT:
        return;

      default:
        throw new Error(`Unsupported MAVROS mission frame: ${frame}`);
    }
  }

  private static assertPoint(point: MavrosMissionPoint): void {
    if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) {
      throw new Error(`Invalid mission latitude: ${point.lat}`);
    }

    if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) {
      throw new Error(`Invalid mission longitude: ${point.lon}`);
    }

    if (!Number.isFinite(point.alt)) {
      throw new Error(`Invalid mission altitude: ${point.alt}`);
    }
  }
}
