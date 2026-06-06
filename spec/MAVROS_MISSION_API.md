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

## Mission progress

MAVROS publishes `/[node_id]/mission/reached`
-> the caller records the completed item index

MAVROS publishes `/[node_id]/mission/waypoints`
-> the caller records the current item index

## Mission completion

-> the mission is complete when `/[node_id]/mission/reached` reports the final item
