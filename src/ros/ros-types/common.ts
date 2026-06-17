export interface BuiltinTime {
  sec: number;
  nanosec: number;
}

export interface StdHeader {
  stamp: BuiltinTime;
  frame_id: string;
}
