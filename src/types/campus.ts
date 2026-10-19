export type RoomCategory = 'lecture' | 'lab' | 'office' | 'facility' | 'lounge' | 'restroom' | 'unknown';
export type Point2 = [number, number];
export type Verification = 'diagram' | 'inferred' | 'verified';
export interface FloorFeature {
  id: string;
  label: string;
  type: 'stairs' | 'elevator' | 'restroom' | 'aed' | 'service' | 'pit';
  polygon: Point2[];
}

export interface RoomBox {
  x: number;      // Center or origin X
  z: number;      // Center or origin Z
  w: number;      // Width (X span)
  d: number;      // Depth (Z span)
  h?: number;     // Height (defaults to standard floor room height ~3.2m)
}

export interface Room {
  id: string;
  name: string;
  aliases: string[];
  category: RoomCategory;
  capacity?: number;
  box: RoomBox;
  entranceNodeId?: string;
  polygon?: Point2[];
  verification?: Verification;
  floorLevel: number;
  buildingId: string;
  color?: string;
  description?: string;
}

export interface FloorSlab {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Floor {
  level: number;
  label: string;
  elevation: number;   // Base Y height in meters (e.g., 0, 4.2, 8.4, 12.6)
  slab: FloorSlab;     // Floor boundary
  rooms: Room[];
  outline?: Point2[];
  voids?: Point2[][];
  features?: FloorFeature[];
  sourceId?: string;
  notes?: string[];
  stackIndex?: number;
}

export interface Building {
  id: string;
  name: string;
  code: string;
  color: string;
  origin: [number, number, number]; // [x, y, z] in world coordinates
  floors: Floor[];
  rotation?: number; // Radians around Y; local X/Z -> world X/Z.
}

export type NavNodeType = 'room_entrance' | 'corridor' | 'stairs' | 'elevator' | 'outdoor' | 'preset';

export interface NavNode {
  id: string;
  name: string;
  position: [number, number, number]; // [x, y, z] in meters
  floor: number;
  buildingId?: string;
  type: NavNodeType;
  isPreset?: boolean;
}

export type NavEdgeType = 'walk' | 'stairs' | 'elevator' | 'bridge' | 'outdoor';

export interface NavEdge {
  from: string;
  to: string;
  distance?: number;      // If omitted, auto-calculated from Euclidean distance
  type: NavEdgeType;
  isIndoor: boolean;
  isAccessible: boolean;  // True for flat walk/elevator/ramp; False for stairs
  instruction?: string;   // Guide message when traversing this edge
  reverseInstruction?: string;
  verification?: Verification;
  bidirectional?: boolean;
  blocked?: boolean;
}

export interface CampusData {
  campusName: string;
  coordinateUnit?: 'meters' | 'schematic';
  buildings: Building[];
  outdoorStructures?: Array<{
    id: string;
    name: string;
    type: 'bridge' | 'plaza' | 'gate';
    box: RoomBox & { y?: number };
    color?: string;
  }>;
  navigation: {
    nodes: NavNode[];
    edges: NavEdge[];
  };
}

export type RouteFilterType = 'shortest' | 'accessible' | 'indoor' | 'stairs';

export interface RouteStep {
  stepNumber: number;
  instruction: string;
  nodeId: string;
  position: [number, number, number];
  floor: number;
  edgeType?: NavEdgeType;
  distance: number;
}

export interface RouteResult {
  pathNodes: NavNode[];
  totalDistance: number;
  estimatedMinutes: number;
  floorChanges: number;
  steps: RouteStep[];
  distanceUnit: 'meters' | 'schematic';
  inferredConnections: number;
}
