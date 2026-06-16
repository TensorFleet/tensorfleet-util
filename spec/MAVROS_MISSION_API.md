# MAVROS Mission API Data Flow

## Defaults

`node_id`: `mavros`

## Startup

`ROS2Bridge` subscribes to `/[node_id]/mission/waypoints`  
-> `ROS2Bridge` subscribes to `/[node_id]/mission/reached`  
-> `ROS2Bridge.waitForService()` confirms `/[node_id]/mission/pull`  
-> `ROS2Bridge.waitForService()` confirms `/[node_id]/mission/push`  
-> `ROS2Bridge.waitForService()` confirms `/[node_id]/mission/clear`  
-> `ROS2Bridge.waitForService()` confirms `/[node_id]/mission/set_current`  
-> `ROS2Bridge.waitForService()` confirms `/[node_id]/cmd/command`  
-> `ROS2Bridge.waitForService()` confirms `/[node_id]/set_mode`

## Build mission data

The caller creates an ordered `MavrosMsgsWaypoint[]`  
-> each item is created with `new MavrosMissionWaypoint(...)`  
-> if the vehicle is not airborne, the first item is `TAKEOFF`  
-> if the vehicle is already airborne, the first item is not `TAKEOFF`  
-> if the final item is `LAND`, the mission ends by landing  
-> if the final item is not `LAND`, the mission ends airborne in hold/loiter

## Read mission

The caller invokes `ROS2Bridge.callService()` for `/[node_id]/mission/pull`  
-> MAVROS publishes `/[node_id]/mission/waypoints`  
-> the caller reads the stored mission and current item index

## Upload mission

The caller invokes `ROS2Bridge.callService()` for `/[node_id]/mission/clear`  
-> the caller invokes `ROS2Bridge.callService()` for `/[node_id]/mission/push`  
-> the caller checks that the call succeeded and transferred every item  
-> the caller invokes `ROS2Bridge.callService()` for `/[node_id]/mission/pull`  
-> MAVROS publishes `/[node_id]/mission/waypoints`  
-> the caller verifies the returned mission against the sent mission

## Set active mission item

The caller invokes `ROS2Bridge.callService()` for `/[node_id]/mission/set_current`  
-> MAVROS publishes `/[node_id]/mission/waypoints`  
-> the caller confirms the current item index

## Pause or resume the active mission

Stopping mission execution is not done by publishing to a mission topic.

To pause the active mission, the caller invokes `ROS2Bridge.callService()` for `/[node_id]/cmd/command` using `mavros_msgs/srv/CommandLong`  
-> `command` is `193` (`MAV_CMD_DO_PAUSE_CONTINUE`)  
-> `param1` is `0.0` to pause the mission and hold position  
-> the caller checks the command response for success

To resume the paused mission, the caller invokes the same service  
-> `command` is `193` (`MAV_CMD_DO_PAUSE_CONTINUE`)  
-> `param1` is `1.0` to continue the mission  
-> the caller checks the command response for success

## Abort the active mission

To abort mission execution rather than pause it, the caller invokes `ROS2Bridge.callService()` for `/[node_id]/set_mode`  
-> the caller selects a non-mission mode supported by the flight controller, such as `HOLD`, `LOITER`, `RTL`, or `LAND`  
-> changing out of mission mode stops automatic mission progression  
-> the caller confirms that the requested mode was accepted

`/[node_id]/mission/clear` removes the mission stored on the vehicle. It is not the preferred command for immediately stopping an active mission.

## Mission progress

MAVROS publishes `/[node_id]/mission/reached`  
-> the caller records the completed item index

MAVROS publishes `/[node_id]/mission/waypoints`  
-> the caller records the current item index

## Mission completion

The mission is complete when `/[node_id]/mission/reached` reports the final item.
