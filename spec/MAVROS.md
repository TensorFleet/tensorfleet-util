# MAVROS

## DEFAULTS

`node_id`: `mavros`

## PUBLISH

path: `/[node_id]/setpoint_position/local`
message type: `geometry_msgs/msg/PoseStamped`
description: Local position setpoint for offboard position control.

path: `/[node_id]/setpoint_velocity/cmd_vel`
message type: `geometry_msgs/msg/TwistStamped`
description: Local velocity setpoint for offboard velocity control.

path: `/[node_id]/setpoint_raw/local`
message type: `mavros_msgs/msg/PositionTarget`
description: Raw local setpoint for position, velocity, acceleration or yaw control.

path: `/[node_id]/setpoint_raw/attitude`
message type: `mavros_msgs/msg/AttitudeTarget`
description: Raw attitude, body-rate and thrust setpoint for offboard attitude control.

## SUBSCRIBE

path: `/[node_id]/global_position/raw/fix`
message type: `sensor_msgs/msg/NavSatFix`
description: Current raw global GPS position.

path: `/[node_id]/global_position/compass_hdg`
message type: `std_msgs/msg/Float64`
description: Current compass heading.

path: `/[node_id]/state`
message type: `mavros_msgs/msg/State`
description: Current FCU connection, arming state and flight mode.

path: `/[node_id]/extended_state`
message type: `mavros_msgs/msg/ExtendedState`
description: Current landed and VTOL state.

path: `/[node_id]/battery`
message type: `sensor_msgs/msg/BatteryState`
description: Current battery telemetry.

path: `/[node_id]/local_position/pose`
message type: `geometry_msgs/msg/PoseStamped`
description: Current local position and orientation.

path: `/[node_id]/local_position/velocity_local`
message type: `geometry_msgs/msg/TwistStamped`
description: Current local linear and angular velocity.

path: `/[node_id]/imu/data`
message type: `sensor_msgs/msg/Imu`
description: Current IMU orientation, angular velocity and linear acceleration.

path: `/[node_id]/altitude`
message type: `mavros_msgs/msg/Altitude`
description: Current altitude estimates.

path: `/[node_id]/home_position/home`
message type: `mavros_msgs/msg/HomePosition`
description: Current home position.

path: `/[node_id]/mission/waypoints`
message type: `mavros_msgs/msg/WaypointList`
description: Current mission waypoint list and active waypoint sequence.

path: `/[node_id]/mission/reached`
message type: `mavros_msgs/msg/WaypointReached`
description: Latest reached mission waypoint sequence.

path: `/[node_id]/statustext`
message type: `mavros_msgs/msg/StatusText`
description: Current MAVROS or FCU status text.

## CALL SERVICES

path: `/[node_id]/cmd/command`
service type: `mavros_msgs/srv/CommandLong`
request type: `CommandLong_Request`
response type: `CommandLong_Response`
description: Send a MAVLink command long request.

path: `/[node_id]/cmd/arming`
service type: `mavros_msgs/srv/CommandBool`
request type: `CommandBool_Request`
response type: `CommandBool_Response`
description: Arm or disarm the vehicle.

path: `/[node_id]/set_mode`
service type: `mavros_msgs/srv/SetMode`
request type: `SetMode_Request`
response type: `SetMode_Response`
description: Set the vehicle flight mode.

path: `/[node_id]/cmd/land`
service type: `mavros_msgs/srv/CommandTOL`
request type: `CommandTOL_Request`
response type: `CommandTOL_Response`
description: Send a land command.

path: `/[node_id]/mission/push`
service type: `mavros_msgs/srv/WaypointPush`
request type: `WaypointPush_Request`
response type: `WaypointPush_Response`
description: Upload mission waypoints to the vehicle.

path: `/[node_id]/mission/pull`
service type: `mavros_msgs/srv/WaypointPull`
request type: `WaypointPull_Request`
response type: `WaypointPull_Response`
description: Read mission waypoints from the vehicle.

path: `/[node_id]/mission/clear`
service type: `mavros_msgs/srv/WaypointClear`
request type: `WaypointClear_Request`
response type: `WaypointClear_Response`
description: Clear mission waypoints on the vehicle.

path: `/[node_id]/mission/set_current`
service type: `mavros_msgs/srv/WaypointSetCurrent`
request type: `WaypointSetCurrent_Request`
response type: `WaypointSetCurrent_Response`
description: Set the active mission waypoint sequence.
