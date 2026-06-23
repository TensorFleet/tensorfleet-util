import type { VacuumCommand, VacuumCommandResult } from "./commands.js";
import type { VacuumAdapterSnapshot } from "./state.js";

export type VacuumAdapter = {
  snapshot: VacuumAdapterSnapshot;
  sendCommand: (command: VacuumCommand) => Promise<VacuumCommandResult>;
};
