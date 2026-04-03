/**
 * Entity API module - provides EntityData type and controller spawning functionality.
 */

import type { ROS2BridgeApi } from "../ros/ros-bridge-api";
import { DroneController } from "../drone/mission-control/drone-controller";
import { DroneStateModel } from "../drone/drone-state-model";
import { logger } from "../logger";

/**
 * Data type representing an entity card with predefined callbacks
 */
export interface EntityData {
  name: string;
  type: string;
  target: string;
  params: Record<string, unknown>;
  getModelNames(): string[];
  onCardClick(): void;
  onInfoClick(): void;
}

/**
 * Options for creating a DroneController from EntityData
 */
export interface DroneControllerSpawnOptions {
  model: DroneStateModel;
  ros2Bridge: ROS2BridgeApi;
}

/**
 * Supported entity types that can spawn a DroneController
 */
const DRONE_ENTITY_TYPES = ["drone", "mavlink", "mavros"] as const;

/**
 * Check if an entity type is a supported drone type
 */
export function isDroneEntityType(type: string): boolean {
  return DRONE_ENTITY_TYPES.includes(type as typeof DRONE_ENTITY_TYPES[number]);
}

/**
 * Spawn a controller based on EntityData type.
 * 
 * If the entity type is "drone", "mavlink", or "mavros", it will spawn a DroneController.
 * Otherwise, it will log an error and return null.
 * 
 * @param entityData - The entity data containing type information
 * @param options - Options containing the DroneStateModel and ROS2BridgeApi
 * @returns A DroneController if the type is supported, null otherwise
 */
export function spawnController(
  entityData: EntityData,
  options: DroneControllerSpawnOptions
): DroneController | null {
  const { type } = entityData;

  if (isDroneEntityType(type)) {
    return new DroneController(options.model, options.ros2Bridge);
  }

  logger.error(`[ENTITY_API] Unsupported entity type "${type}" for entity "${entityData.name}". Expected one of: ${DRONE_ENTITY_TYPES.join(", ")}`);
  return null;
}