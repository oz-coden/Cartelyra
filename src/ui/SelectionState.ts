import type { Place } from "../types/campus";

export type EndpointTarget = "start" | "dest";
export type PickTarget = EndpointTarget | "none";

/** Shared by search, map picking and details. Selection within a building never implies camera movement. */
export class SelectionState {
  public selected: Place | null = null;
  public pickTarget: PickTarget = "none";
}
