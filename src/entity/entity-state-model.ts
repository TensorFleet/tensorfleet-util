// entity-state-model.ts

/**
 * Base state interface for any spatial entity.
 * Contains fundamental spatial properties like position, orientation, and altitude.
 */
export type EntityState = {
  /** Home position reference point. */
  home?: {
    time_boot_ms: number;
    lat: number;
    lon: number;
    alt: number;
    orientation?: { x: number; y: number; z: number; w: number };
  };

  /** Local pose/velocity in ENU (East-North-Up) coordinate frame. */
  local?: {
    time_boot_ms: number;
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    linear: { x: number; y: number; z: number };
    angular: { x: number; y: number; z: number };
  };

  /** Local position in NED (North-East-Down) coordinate frame. */
  local_position_ned?: {
    time_boot_ms: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
  };

  /** Global position from GPS/ GNSS. */
  global_position_int?: {
    time_boot_ms: number;
    lat: number;
    lon: number;
    alt: number;
    relative_alt: number;
    vx: number;
    vy: number;
    vz: number;
    hdg: number; // heading in degrees
  };

  /** Attitude (Euler angles). */
  attitude?: {
    time_boot_ms: number;
    roll: number;
    pitch: number;
    yaw: number;
    rollspeed: number;
    pitchspeed: number;
    yawspeed: number;
  };

  /** Orientation as a quaternion. */
  rotation?: { x: number; y: number; z: number; w: number };

  /** Yaw angle in radians. NED convention: 0 = North, positive clockwise toward East. */
  yaw?: number;

  /** Altitude breakdown (AMSL, AGL, relative, etc.). */
  altitude?: {
    time_boot_ms: number;
    amsl?: number;
    agl?: number;
    local?: number;
    relative?: number;
    terrain?: number;
    bottom_clearance?: number;
  };

  /** IMU (Inertial Measurement Unit) data. */
  imu?: {
    time_boot_ms: number;
    orientation: { x: number; y: number; z: number; w: number };
    angular_velocity: { x: number; y: number; z: number };
    linear_acceleration: { x: number; y: number; z: number };
  };
};

/**
 * Base class for managing spatial entity state.
 * Provides logical utilities for position, orientation, and altitude calculations.
 * No networking or topic handling is performed in this class.
 */
export class EntityStateModel {
  protected state: Partial<EntityState> = {};

  /** Returns the current state (non-copy, for read-only access). */
  protected getBaseState(): Partial<EntityState> {
    return this.state;
  }

  // -------- Spatial Utility Methods --------

  /**
   * Calculates the horizontal distance from home position using local coordinates.
   * Returns 0 if local position is not available.
   */
  public getHorizontalDistanceFromHome(): number {
    const local = this.state.local?.position;
    if (!local) return 0;
    return Math.sqrt(local.x * local.x + local.y * local.y);
  }

  /**
   * Gets the current altitude above sea level (AMSL).
   * Falls back to home altitude + relative altitude if AMSL is not directly available.
   */
  public getAltitudeAMSL(): number | undefined {
    const alt = this.state.altitude;
    if (alt?.amsl !== undefined) return alt.amsl;
    if (alt?.relative !== undefined && this.state.home?.alt !== undefined) {
      return this.state.home.alt + alt.relative;
    }
    return this.state.global_position_int?.alt;
  }

  /**
   * Gets the current altitude above ground level (AGL).
   */
  public getAltitudeAGL(): number | undefined {
    return this.state.altitude?.agl ?? this.state.altitude?.relative;
  }

  /**
   * Gets the current yaw angle in radians.
   * Falls back to attitude yaw or heading if not directly available.
   */
  public getYaw(): number | undefined {
    if (this.state.yaw !== undefined) return this.state.yaw;
    if (this.state.attitude?.yaw !== undefined) return this.state.attitude.yaw;
    if (this.state.global_position_int?.hdg !== undefined) {
      return (this.state.global_position_int.hdg * Math.PI) / 180;
    }
    return undefined;
  }

  /**
   * Gets the current position in ENU local coordinates.
   */
  public getLocalPosition(): { x: number; y: number; z: number } | undefined {
    return this.state.local?.position;
  }

  /**
   * Gets the current position in NED local coordinates.
   */
  public getNEDPosition(): { x: number; y: number; z: number } | undefined {
    const ned = this.state.local_position_ned;
    if (ned) return { x: ned.x, y: ned.y, z: ned.z };
    return undefined;
  }

  /**
   * Gets the current global position (lat, lon, alt).
   */
  public getGlobalPosition(): { lat: number; lon: number; alt: number } | undefined {
    const gpi = this.state.global_position_int;
    if (gpi) return { lat: gpi.lat, lon: gpi.lon, alt: gpi.alt };
    return undefined;
  }

  /**
   * Gets the home position.
   */
  public getHomePosition(): { lat: number; lon: number; alt: number } | undefined {
    const home = this.state.home;
    if (home) return { lat: home.lat, lon: home.lon, alt: home.alt };
    return undefined;
  }

  /**
   * Gets the current orientation as a quaternion.
   */
  public getOrientation(): { x: number; y: number; z: number; w: number } | undefined {
    return this.state.rotation ?? this.state.local?.orientation ?? this.state.imu?.orientation;
  }

  /**
   * Gets the current linear velocity in local coordinates.
   */
  public getLinearVelocity(): { x: number; y: number; z: number } | undefined {
    return this.state.local?.linear;
  }

  /**
   * Gets the current angular velocity.
   */
  public getAngularVelocity(): { x: number; y: number; z: number } | undefined {
    return this.state.local?.angular ?? this.state.imu?.angular_velocity;
  }

  /**
   * Gets the current linear acceleration from IMU.
   */
  public getLinearAcceleration(): { x: number; y: number; z: number } | undefined {
    return this.state.imu?.linear_acceleration;
  }

  /**
   * Gets the current roll angle in radians.
   */
  public getRoll(): number | undefined {
    return this.state.attitude?.roll;
  }

  /**
   * Gets the current pitch angle in radians.
   */
  public getPitch(): number | undefined {
    return this.state.attitude?.pitch;
  }

  /**
   * Checks if the entity has a valid position (either local or global).
   */
  public hasValidPosition(): boolean {
    return (
      (this.state.local?.position !== undefined) ||
      (this.state.global_position_int !== undefined &&
        (this.state.global_position_int.lat !== 0 || this.state.global_position_int.lon !== 0))
    );
  }

  /**
   * Checks if the entity has a valid home position.
   */
  public hasHomePosition(): boolean {
    return this.state.home !== undefined &&
      (this.state.home.lat !== 0 || this.state.home.lon !== 0);
  }

  /**
   * Calculates the 3D distance from home using local coordinates.
   */
  public getDistanceFromHome(): number {
    const local = this.state.local?.position;
    if (!local) return 0;
    return Math.sqrt(local.x * local.x + local.y * local.y + local.z * local.z);
  }

  /**
   * Gets the current speed (magnitude of linear velocity).
   */
  public getSpeed(): number {
    const vel = this.state.local?.linear;
    if (!vel) return 0;
    return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  }

  /**
   * Gets the horizontal speed (magnitude of horizontal velocity).
   */
  public getHorizontalSpeed(): number {
    const vel = this.state.local?.linear;
    if (!vel) return 0;
    return Math.sqrt(vel.x * vel.x + vel.y * vel.y);
  }

  /**
   * Gets the vertical speed.
   */
  public getVerticalSpeed(): number {
    return this.state.local?.linear?.z ?? 0;
  }

  /**
   * Connects to a data source (e.g., ROS bridge, simulator, etc.).
   * Subclasses should override this method to establish connections
   * to their specific data sources.
   * @param source The data source to connect to (type varies by subclass)
   */
  public connect(source: unknown): void {
    // Default implementation does nothing
    // Subclasses should override to establish their specific connections
  }
}
