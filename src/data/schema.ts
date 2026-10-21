import type {
  FloorFeature,
  NavEdgeType,
  NavNodeType,
  Point2,
  RoomCategory,
  Verification,
} from "../types/campus";

export interface FloorSource {
  id: string;
  buildingId: string;
  level: number;
  label: string;
  stackIndex: number;
  elevation: number;
  sourceId: string;
  notes: string[];
  outline: Point2[];
  voids: Point2[][];
  features: FloorFeature[];
  rooms: Array<{
    id: string;
    mapLabel?: string;
    name: string;
    aliases: string[];
    category: RoomCategory;
    polygon: Point2[];
    entrance?: string;
    approachRoomId?: string;
    description?: string;
  }>;
  navigation: {
    nodes: Array<{
      id: string;
      name: string;
      position: Point2;
      type: NavNodeType;
      isPreset?: boolean;
    }>;
    edges: SourceEdge[];
  };
}

export interface SourceEdge {
  from: string;
  to: string;
  type: NavEdgeType;
  verification: Verification;
  isIndoor: boolean;
  isAccessible: boolean; // Stair avoidance only; does not certify wheelchair access.
  bidirectional?: boolean;
  blocked?: boolean;
  distance?: number;
  instruction?: string;
  reverseInstruction?: string;
}

export interface BuildingSource {
  id: string;
  name: string;
  code: string;
  color: string;
  origin: [number, number, number];
  rotation: number;
  floorIds: string[];
  connections: SourceEdge[]; // Qualified node IDs, e.g. b3/f1/stair2.
}

export interface CampusSource {
  schemaVersion: 1;
  campusName: string;
  coordinateUnit: "schematic" | "meters";
  buildingIds: string[];
  connections?: SourceEdge[]; // Explicit links between buildings, using qualified node IDs.
  outdoor?: {
    sourceId: string;
    notes: string[];
    nodes: Array<{
      id: string;
      name: string;
      position: Point2; // Campus overview coordinates, never indoor world coordinates.
      layer: "ground" | "bridge" | "underground";
      gateId?: string;
    }>;
    edges: Array<SourceEdge & { widthClass: "unknown" | "wide" | "narrow" }>;
    links: Array<{
      from: string; // Outdoor-local ID on the building's overview boundary.
      to: string; // Qualified indoor entrance node ID.
      verification: Verification;
      isAccessible: boolean;
    }>;
  };
}

export interface SourceDocument {
  id: string;
  filename: string;
  description: string;
}
export interface CampusOverview {
  sourceId: string;
  buildings: Array<{ id: string; name: string; polygon: Point2[] }>;
  gates: Array<{
    id: string;
    name: string;
    position: Point2;
    aliases?: string[];
    description?: string;
  }>;
}
