export type TurtleBot4Nav2ConnectionStatus = "connected" | "connecting" | "disconnected";

export type TurtleBot4Nav2TopicInfo = {
  topic: string;
  type: string;
};

export type TurtleBot4Nav2ServiceInfo = {
  service: string;
  type: string;
};

export type TurtleBot4Nav2TopicHealthStatus = "not_advertised" | "advertised" | "receiving" | "stale";

export type TurtleBot4Nav2TopicHealth = {
  topic: string;
  status: TurtleBot4Nav2TopicHealthStatus;
  lastMessageAt: number | null;
  detail?: string;
};

export type TurtleBot4Nav2GoalState =
  | "ready"
  | "sending"
  | "accepted"
  | "executing"
  | "canceling"
  | "succeeded"
  | "canceled"
  | "aborted"
  | "rejected"
  | "blocked"
  | "unknown";

export type TurtleBot4Nav2RuntimeState = {
  connectionStatus: TurtleBot4Nav2ConnectionStatus;
  availableTopics: TurtleBot4Nav2TopicInfo[];
  availableServices: string[];
  topicHealth: TurtleBot4Nav2TopicHealth[];
  goalState: TurtleBot4Nav2GoalState;
};

export const TURTLEBOT4_NAV2_SEND_GOAL_SERVICE = "/navigate_to_pose/_action/send_goal";
export const TURTLEBOT4_NAV2_CANCEL_GOAL_SERVICE = "/navigate_to_pose/_action/cancel_goal";
