import type { Building, CampusData, Place } from "../types/campus";
import type { CampusOverview } from "./schema";
import { bounds, worldToLocal } from "./geometry.js";

export interface BuildingEntry {
  id: string;
  name: string;
  data?: Building;
}
export const featurePlaceId = (
  buildingId: string,
  floorId: string,
  featureId: string,
) => `${buildingId}/${floorId}/feature/${featureId}`;

export function buildingCatalog(
  campus: CampusData,
  overview: CampusOverview,
): BuildingEntry[] {
  const entries = new Map<string, BuildingEntry>(
    overview.buildings.map((b) => [b.id, { id: b.id, name: b.name }]),
  );
  for (const building of campus.buildings)
    entries.set(building.id, {
      id: building.id,
      name: building.name,
      data: building,
    });
  return [...entries.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ja", { numeric: true }),
  );
}

export function placeIndex(
  campus: CampusData,
  overview?: CampusOverview,
): Place[] {
  const places: Place[] = [],
    indexedNodes = new Set<string>();
  for (const building of campus.buildings)
    for (const floor of building.floors) {
      const context = {
        scope: "building" as const,
        buildingId: building.id,
        buildingName: building.name,
        floorLevel: floor.level,
        floorLabel: floor.label,
      };
      for (const room of floor.rooms) {
        places.push({
          ...context,
          id: room.id,
          name: room.name,
          kind: "room",
          roomId: room.id,
          nodeId: room.entranceNodeId,
          position: [room.box.x, room.box.z],
          polygon: room.polygon,
          aliases: [room.id, ...room.aliases],
          description: room.description,
        });
        if (room.entranceNodeId) indexedNodes.add(room.entranceNodeId);
      }
      for (const feature of floor.features ?? []) {
        if (!["restroom", "elevator", "stairs", "aed"].includes(feature.type))
          continue;
        const box = bounds(feature.polygon);
        const aliases = [...(feature.aliases ?? []), feature.label];
        if (feature.type === "restroom")
          aliases.push(
            "WC",
            "トイレ",
            "お手洗い",
            "便所",
            ...(feature.restroomType === "male"
              ? ["男子", "男性"]
              : feature.restroomType === "female"
                ? ["女子", "女性"]
                : feature.restroomType === "multipurpose"
                  ? ["多目的"]
                  : feature.restroomType === "all-gender"
                    ? ["共用"]
                    : []),
          );
        if (feature.type === "elevator") aliases.push("EV", "エレベーター");
        if (feature.type === "aed") aliases.push("AED", "自動体外式除細動器");
        places.push({
          ...context,
          id: featurePlaceId(building.id, floor.id, feature.id),
          featureId: feature.id,
          name: feature.label,
          kind: feature.type as "restroom" | "elevator" | "stairs" | "aed",
          position: [box.x, box.z],
          polygon: feature.polygon,
          aliases,
          nodeId: feature.entranceNodeId,
          description: feature.description,
          restroomType: feature.restroomType,
        });
        if (feature.entranceNodeId) indexedNodes.add(feature.entranceNodeId);
      }
      for (const node of campus.navigation.nodes) {
        if (
          !node.isPreset ||
          indexedNodes.has(node.id) ||
          node.buildingId !== building.id ||
          node.floor !== floor.level
        )
          continue;
        places.push({
          ...context,
          id: node.id,
          nodeId: node.id,
          kind: "entrance",
          name: node.name,
          position: worldToLocal(building, node.position),
          aliases: [node.name],
        });
      }
    }
  for (const gate of overview?.gates ?? [])
    places.push({
      id: `campus/gate/${gate.id}`,
      name: gate.name,
      kind: "gate",
      scope: "campus",
      position: gate.position,
      aliases: [...(gate.aliases ?? []), "門", "gate"],
      description: gate.description,
    });
  return places;
}

export const placeContext = (place: Place) =>
  place.scope === "campus"
    ? "キャンパス / 門"
    : `${place.buildingName} ${place.floorLabel}`;
export const placeDisplayName = (place: Place) =>
  `${place.name}（${placeContext(place)}）`;
export const normalizeSearch = (value: string) =>
  value.normalize("NFKC").replace(/[−–—]/g, "-").trim().toLowerCase();
export function searchPlaces(
  places: Place[],
  query: string,
  buildingId?: string,
  floorLevel?: number,
): Place[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return places
    .filter((place) => {
      const text = normalizeSearch(
        [
          place.name,
          place.buildingName,
          place.floorLabel,
          ...place.aliases,
        ].join(" "),
      );
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => {
      const rank = (p: Place) =>
        (p.buildingId === buildingId ? 0 : 4) +
        (p.floorLevel === floorLevel ? 0 : 2) +
        (p.nodeId ? 0 : 1);
      return (
        rank(a) - rank(b) ||
        a.name.localeCompare(b.name, "ja", { numeric: true })
      );
    });
}
