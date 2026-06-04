# MAVROS Mission API Data Flow

## Defaults

`node_id`: `mavros`

## Startup

`MissionApi` initializes
-> `ROS2Bridge` connects through `Foxglove`
-> `Foxglove` advertises MAVROS topics and services
-> `MissionApi` waits for required mission services
-> `MissionApi` subscribes to mission feedback topics

required services:
`/[node_id]/mission/pull`
`/[node_id]/mission/push`
`/[node_id]/mission/clear`
`/[node_id]/mission/set_current`

required feedback topics:
`/[node_id]/mission/waypoints`
`/[node_id]/mission/reached`
`/[node_id]/state`
`/[node_id]/statustext`

## Read mission

UI requests current mission
-> `MissionApi` calls `/[node_id]/mission/pull`
-> MAVROS pulls mission from FCU
-> MAVROS publishes `/[node_id]/mission/waypoints`
-> `MissionApi` stores `MavrosMsgsWaypointList`
-> UI receives `current_seq` and `waypoints`

## Upload mission

UI sends mission definition
-> `MissionApi` converts mission definition to `MavrosMsgsWaypoint[]`
-> `MissionApi` optionally calls `/[node_id]/mission/clear`
-> `MissionApi` calls `/[node_id]/mission/push` with `WaypointPush_Request`
-> MAVROS uploads waypoints to FCU
-> MAVROS returns `WaypointPush_Response`
-> `MissionApi` checks `success` and `wp_transfered`
-> `MissionApi` calls `/[node_id]/mission/pull`
-> MAVROS publishes `/[node_id]/mission/waypoints`
-> `MissionApi` verifies uploaded mission against returned waypoint list
-> UI receives verified mission state

## Set active mission item

UI selects mission item index
-> `MissionApi` calls `/[node_id]/mission/set_current` with `WaypointSetCurrent_Request`
-> MAVROS sets active waypoint on FCU
-> MAVROS returns `WaypointSetCurrent_Response`
-> MAVROS publishes updated `/[node_id]/mission/waypoints`
-> `MissionApi` updates `current_seq`
-> UI receives active mission item

## Start mission

UI requests mission start
-> `MissionApi` confirms `/[node_id]/state` is connected
-> `MissionApi` arms vehicle using `/[node_id]/cmd/arming`
-> `MissionApi` sets mission mode using `/[node_id]/set_mode`
-> MAVROS publishes `/[node_id]/state`
-> `MissionApi` confirms armed and mission mode
-> UI receives mission running state

## Mission progress

FCU advances mission
-> MAVROS publishes `/[node_id]/mission/reached`
-> MAVROS publishes `/[node_id]/mission/waypoints`
-> `MissionApi` updates reached waypoint and `current_seq`
-> UI receives mission progress

## Abort or stop mission

UI requests abort
-> `MissionApi` changes mode using `/[node_id]/set_mode`
-> MAVROS publishes `/[node_id]/state`
-> `MissionApi` confirms vehicle left mission mode
-> UI receives stopped mission state
