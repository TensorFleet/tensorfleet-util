# MAVROS

## Defaults

`node_id`: `mavros`

## Publish

path: `/[node_id]/setpoint_position/local`
message type: `geometry_msgs/msg/PoseStamped`
description: Sends a local position target.

path: `/[node_id]/setpoint_velocity/cmd_vel`
message type: `geometry_msgs/msg/TwistStamped`
description: Sends a local velocity target.

path: `/[node_id]/setpoint_raw/local`
message type: `mavros_msgs/msg/PositionTarget`
description: Sends a raw local target.

path: `/[node_id]/setpoint_raw/attitude`
message type: `mavros_msgs/msg/AttitudeTarget`
description: Sends an attitude, body-rate, and thrust target.

Mission data is not published to a topic. It is sent through `/[node_id]/mission/push`.

## Subscribe

path: `/[node_id]/global_position/raw/fix`
message type: `sensor_msgs/msg/NavSatFix`
description: Current global position.

path: `/[node_id]/global_position/compass_hdg`
message type: `std_msgs/msg/Float64`
description: Current heading.

path: `/[node_id]/state`
message type: `mavros_msgs/msg/State`
description: Current connection, arming state, and flight mode.

path: `/[node_id]/extended_state`
message type: `mavros_msgs/msg/ExtendedState`
description: Current landed state.

path: `/[node_id]/battery`
message type: `sensor_msgs/msg/BatteryState`
description: Current battery state.

path: `/[node_id]/local_position/pose`
message type: `geometry_msgs/msg/PoseStamped`
description: Current local position and orientation.

path: `/[node_id]/local_position/velocity_local`
message type: `geometry_msgs/msg/TwistStamped`
description: Current local velocity.

path: `/[node_id]/imu/data`
message type: `sensor_msgs/msg/Imu`
description: Current IMU state.

path: `/[node_id]/altitude`
message type: `mavros_msgs/msg/Altitude`
description: Current altitude values.

path: `/[node_id]/home_position/home`
message type: `mavros_msgs/msg/HomePosition`
description: Current home position.

path: `/[node_id]/mission/waypoints`
message type: `mavros_msgs/msg/WaypointList`
description: Current mission data and active item index.

path: `/[node_id]/mission/reached`
message type: `mavros_msgs/msg/WaypointReached`
description: Latest completed mission item index.

## Call services

path: `/[node_id]/cmd/command`
service type: `mavros_msgs/srv/CommandLong`
request type: `CommandLong_Request`
response type: `CommandLong_Response`
description: Sends a command.

path: `/[node_id]/cmd/arming`
service type: `mavros_msgs/srv/CommandBool`
request type: `CommandBool_Request`
response type: `CommandBool_Response`
description: Arms or disarms the vehicle.

path: `/[node_id]/set_mode`
service type: `mavros_msgs/srv/SetMode`
request type: `SetMode_Request`
response type: `SetMode_Response`
description: Changes the flight mode.

path: `/[node_id]/cmd/land`
service type: `mavros_msgs/srv/CommandTOL`
request type: `CommandTOL_Request`
response type: `CommandTOL_Response`
description: Sends a direct land command.

path: `/[node_id]/mission/clear`
service type: `mavros_msgs/srv/WaypointClear`
request type: `WaypointClear_Request`
response type: `WaypointClear_Response`
description: Removes the stored mission.

path: `/[node_id]/mission/push`
service type: `mavros_msgs/srv/WaypointPush`
request type: `WaypointPush_Request`
response type: `WaypointPush_Response`
description: Sends `MavrosMsgsWaypoint[]` to the vehicle.

path: `/[node_id]/mission/pull`
service type: `mavros_msgs/srv/WaypointPull`
request type: `WaypointPull_Request`
response type: `WaypointPull_Response`
description: Requests the mission stored on the vehicle.

path: `/[node_id]/mission/set_current`
service type: `mavros_msgs/srv/WaypointSetCurrent`
request type: `WaypointSetCurrent_Request`
response type: `WaypointSetCurrent_Response`
description: Sets the active mission item index.
