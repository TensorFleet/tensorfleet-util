export interface RegionConfig {
  /** Display name for the region */
  name: string;
  /** Short code/id for the region */
  id: string;
  /** Backend API URL (auth, data) */
  backendUrl: string;
  /** VM Manager API URL */
  vmManagerUrl: string;
  /** Foxglove WebSocket URL (derived from VM IP at runtime) */
  foxglovePort: number;
  /** ROS2 WebSocket URL (derived from VM IP at runtime) */
  ros2Port: number;
  /** Geographic description */
  description: string;
  /** Icon for display */
  icon: string;
  /** If true, this region is only shown when running in dev mode */
  devOnly?: boolean;
}

export const REGIONS: Record<string, RegionConfig> = {
  'eu': {
    id: 'eu',
    name: 'EU Central',
    backendUrl: 'https://app.tensorfleet.net',
    vmManagerUrl: 'https://eu.vm.tensorfleet.net',
    foxglovePort: 8765,
    ros2Port: 9091,
    description: 'Europe - Central',
    icon: '🇪🇺'
  },
  'asia': {
    id: 'asia',
    name: 'Asia',
    backendUrl: 'https://app.tensorfleet.net',
    vmManagerUrl: 'http://vm-manager-asia-1.tail4f6a7.ts.net',
    foxglovePort: 8765,
    ros2Port: 9091,
    description: 'Asia - Southeast (beta/staging)',
    icon: '🇹🇭',
    devOnly: true
  },
  'local': {
    id: 'local',
    name: 'Local Development',
    backendUrl: 'https://app.tensorfleet.net',
    vmManagerUrl: 'http://localhost:8080',
    foxglovePort: 8765,
    ros2Port: 9091,
    description: 'Local development server',
    icon: '💻',
    devOnly: true
  }
};

export const DEFAULT_REGION = 'eu';

export function getAvailableRegions(includeDevOnly: boolean): Record<string, RegionConfig> {
  if (includeDevOnly) {
    return REGIONS;
  }

  return Object.fromEntries(
    Object.entries(REGIONS).filter(([, config]) => !config.devOnly)
  );
}

export function getRegionById(regionId: string, includeDevOnly: boolean): RegionConfig | undefined {
  return getAvailableRegions(includeDevOnly)[regionId];
}

export function getRegionOrDefault(regionId: string | undefined, includeDevOnly: boolean): RegionConfig {
  const availableRegions = getAvailableRegions(includeDevOnly);
  if (regionId && availableRegions[regionId]) {
    return availableRegions[regionId];
  }

  return availableRegions[DEFAULT_REGION] ?? REGIONS[DEFAULT_REGION];
}
