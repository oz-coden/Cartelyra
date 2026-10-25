import * as THREE from "three";
import {
  CampusData,
  Building,
  Floor,
  Room,
  NavNode,
  Point2,
  FloorFeature,
} from "../types/campus";
import { featurePlaceId } from "../data/places";
import { bounds, interiorPoint, worldToLocal } from "../data/geometry";

export interface RoomMeshRecord {
  mesh: THREE.Mesh;
  edgeLine: THREE.LineSegments;
  labelSprite?: THREE.Sprite;
  room: Room;
  building: Building;
  baseColor: string;
}

export class BuildingRenderer {
  public rootGroup: THREE.Group;
  public floorGroups: Map<string, THREE.Group> = new Map(); // key: `${bldgId}_f${level}`
  public roomMeshRecords: Map<string, RoomMeshRecord> = new Map(); // key: room.id
  public placeMeshes: THREE.Mesh[] = [];
  public skyBridgeGroup: THREE.Group | null = null;
  private buildingGroups = new Map<string, THREE.Group>();
  private isDarkTheme: boolean = false;
  private selectedPlaceId: string | null = null;
  private placeMaterials = new Map<
    string,
    { mesh: THREE.Mesh; baseOpacity: number }
  >();

  constructor(private campusData: CampusData, buildingIds = campusData.buildings.map(b => b.id)) {
    this.rootGroup = new THREE.Group();
    this.setBuildings(buildingIds);
    this.buildOutdoorStructures();
  }

  /** Retain only the displayed building or connected group, releasing discarded resources. */
  public setBuildings(buildingIds: string[]) {
    const required = new Set(buildingIds);
    let changed = false;
    for (const [id, group] of this.buildingGroups) {
      if (required.has(id)) continue;
      this.releaseBuilding(id, group);
      changed = true;
    }
    for (const id of required) {
      if (this.buildingGroups.has(id)) continue;
      const building = this.campusData.buildings.find(b => b.id === id);
      if (building) { this.buildBuilding(building); changed = true; }
    }
    if (changed) this.highlightPlace(this.selectedPlaceId);
  }

  private releaseBuilding(id: string, group: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const meshes = new Set<THREE.Object3D>();
    group.traverse(object => {
      meshes.add(object);
      if (object.userData.placeId) this.placeMaterials.delete(object.userData.placeId);
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) geometries.add(object.geometry);
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
    });
    this.rootGroup.remove(group);
    this.buildingGroups.delete(id);
    for (const [key, floor] of this.floorGroups) if (floor.userData.buildingId === id) this.floorGroups.delete(key);
    for (const [key, room] of this.roomMeshRecords) if (room.building.id === id) this.roomMeshRecords.delete(key);
    this.placeMeshes = this.placeMeshes.filter(mesh => !meshes.has(mesh));
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  }

  private buildBuilding(bldg: Building) {
    const bldgGroup = new THREE.Group();
    bldgGroup.position.set(...bldg.origin);
    bldgGroup.rotation.y = bldg.rotation ?? 0;
    bldgGroup.userData = { type: "building", id: bldg.id, name: bldg.name };

    for (const floor of bldg.floors) {
      const floorKey = `${bldg.id}_f${floor.level}`;
      const floorGroup = new THREE.Group();
      floorGroup.position.y = floor.elevation;
      floorGroup.userData = {
        type: "floor",
        buildingId: bldg.id,
        floorId: floor.id,
        level: floor.level,
        baseElevation: floor.elevation,
        stackIndex: floor.stackIndex ?? floor.level - 1,
      };

      // Floor Slab
      const slabMesh = this.createFloorSlab(floor, bldg);
      floorGroup.add(slabMesh);

      // Rooms
      for (const room of floor.rooms) {
        const roomObj = this.createRoom(room, bldg, floor);
        floorGroup.add(roomObj);
      }

      // Vertical Facilities: Stairs & Elevators
      if (floor.features)
        for (const feature of floor.features)
          floorGroup.add(this.createFeature(feature, bldg, floor));
      const vertNodes = this.campusData.navigation.nodes.filter(
        (n) =>
          n.buildingId === bldg.id &&
          n.floor === floor.level &&
          (n.type === "stairs" || n.type === "elevator"),
      );
      for (const node of floor.features ? [] : vertNodes) {
        const marker = this.createVerticalFacilityMarker(node, bldg);
        floorGroup.add(marker);
      }

      this.floorGroups.set(floorKey, floorGroup);
      bldgGroup.add(floorGroup);
    }

    this.rootGroup.add(bldgGroup);
    this.buildingGroups.set(bldg.id, bldgGroup);
  }

  private createFloorSlab(floor: Floor, bldg: Building): THREE.Group {
    const slabGroup = new THREE.Group();
    const { w, d, x, z } = floor.slab;
    const slabHeight = 0.35;

    const slabGeo = floor.outline
      ? this.polygonGeometry(floor.outline, slabHeight, floor.voids)
      : new THREE.BoxGeometry(w, slabHeight, d);
    const slabMat = new THREE.MeshStandardMaterial({
      color: this.isDarkTheme ? 0x1e293b : 0xe2e8f0,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: this.isDarkTheme ? 0.7 : 0.85,
    });

    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.set(
      floor.outline ? 0 : x,
      floor.outline ? -slabHeight : -slabHeight / 2,
      floor.outline ? 0 : z,
    );
    slabMesh.receiveShadow = true;
    slabMesh.castShadow = true;
    slabGroup.add(slabMesh);

    // Subtle edge wire
    const edgeGeo = new THREE.EdgesGeometry(slabGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: this.isDarkTheme ? 0x475569 : 0xcbd5e1,
      linewidth: 1,
    });
    const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLine.position.copy(slabMesh.position);
    slabGroup.add(edgeLine);

    // Floor indicator badge sprite on slab corner
    const badgeSprite = this.createFloorBadgeSprite(
      `${bldg.code}-${floor.label}`,
    );
    badgeSprite.position.set(x - w / 2 - 1.5, 0.4, z + d / 2 + 1.2);
    slabGroup.add(badgeSprite);

    return slabGroup;
  }

  private createRoom(room: Room, bldg: Building, floor: Floor): THREE.Group {
    const roomGroup = new THREE.Group();
    const { x, z, w, d } = room.box;
    const h = room.box.h || 3.4;

    const boxGeo = room.polygon
      ? this.polygonGeometry(
          room.polygon.map((p) => [p[0] - x, p[1] - z]),
          h,
        )
      : new THREE.BoxGeometry(w, h, d);

    const baseColor = room.color || (room.spaceType === "area" ? "#8ebacc" : bldg.color);
    const roomMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(baseColor),
      roughness: 0.25,
      metalness: 0.05,
      transmission: this.isDarkTheme ? 0.3 : 0.45,
      transparent: true,
      opacity: this.isDarkTheme ? 0.75 : 0.85,
      clearcoat: 0.3,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });

    const roomMesh = new THREE.Mesh(boxGeo, roomMat);
    roomMesh.position.set(x, room.polygon ? 0 : h / 2, z);
    roomMesh.castShadow = true;
    roomMesh.receiveShadow = true;
    roomMesh.userData = {
      type: "room",
      roomId: room.id,
      room,
      building: bldg,
      floor,
    };

    roomMesh.userData.placeId = room.id;
    const labelPoint = room.polygon ? interiorPoint(room.polygon) : [x, z];
    roomMesh.userData.labelAnchor = [labelPoint[0] - x, room.polygon ? h : h / 2, labelPoint[1] - z];
    this.placeMeshes.push(roomMesh);
    this.placeMaterials.set(room.id, {
      mesh: roomMesh,
      baseOpacity: roomMat.opacity,
    });
    roomGroup.add(roomMesh);

    // Architectural edge lines
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: this.isDarkTheme ? 0x38bdf8 : 0x1e3a8a,
      transparent: true,
      opacity: this.isDarkTheme ? 0.8 : 0.6,
    });
    const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLine.position.copy(roomMesh.position);
    roomGroup.add(edgeLine);

    // Floating text label sprite
    const labelSprite = this.createTextLabelSprite(room.mapLabel ?? room.id, baseColor);
    labelSprite.position.set(labelPoint[0], h + 0.8, labelPoint[1]);
    const labelWidth = Math.min(10, w * 0.9, d * 2);
    labelSprite.scale.set(labelWidth, labelWidth / 4, 1);
    roomGroup.add(labelSprite);

    // Save record for fast interaction & highlighting
    this.roomMeshRecords.set(room.id, {
      mesh: roomMesh,
      edgeLine,
      labelSprite,
      room,
      building: bldg,
      baseColor,
    });

    return roomGroup;
  }

  private polygonGeometry(
    polygon: Point2[],
    depth: number,
    holes: Point2[][] = [],
  ): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape(
      polygon.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    for (const hole of holes)
      shape.holes.push(
        new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
      );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  private createFeature(
    feature: FloorFeature,
    building: Building,
    floor: Floor,
  ): THREE.Group {
    const group = new THREE.Group();
    const color =
      feature.type === "stairs"
        ? "#c58d31"
        : feature.type === "elevator"
          ? "#218c9e"
          : feature.type === "aed"
            ? "#cf4563"
            : feature.type === "entrance"
              ? "#168568"
              : "#8793a5";
    const geometry = this.polygonGeometry(feature.polygon, 1.5);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.7,
      }),
    );
    mesh.userData.placeId = featurePlaceId(building.id, floor.id, feature.id);
    if (["restroom", "elevator", "stairs", "aed", "entrance"].includes(feature.type)) {
      this.placeMeshes.push(mesh);
      this.placeMaterials.set(mesh.userData.placeId, {
        mesh,
        baseOpacity: 0.7,
      });
    }
    group.add(mesh);
    const box = bounds(feature.polygon);
    const label = this.createTextLabelSprite(feature.label, color);
    label.position.set(box.x, 3, box.z);
    label.scale.set(9, 2.25, 1);
    group.add(label);
    return group;
  }

  private buildOutdoorStructures() {
    if (!this.campusData.outdoorStructures) return;

    for (const struct of this.campusData.outdoorStructures) {
      const group = new THREE.Group();
      const { x, z, w, d } = struct.box;
      const h = struct.box.h || 1;
      const y = struct.box.y || 0;

      const geo = new THREE.BoxGeometry(w, h, d);
      const isBridge = struct.type === "bridge";

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(struct.color || "#64748b"),
        roughness: isBridge ? 0.2 : 0.8,
        transparent: isBridge,
        opacity: isBridge ? 0.75 : 1.0,
        metalness: isBridge ? 0.2 : 0.05,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      if (isBridge) mesh.castShadow = true;

      if (isBridge) {
        // Group is positioned at base height (y = 4.5m) so it can explode with 2F
        group.position.set(0, y, 0);
        group.userData = { type: "bridge", level: 2, baseElevation: y };
        this.skyBridgeGroup = group;

        mesh.position.set(x, h / 2, z);
        group.add(mesh);

        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: this.isDarkTheme ? 0x38bdf8 : 0x0284c7,
        });
        const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLine.position.copy(mesh.position);
        group.add(edgeLine);

        // Label on bridge
        const label = this.createTextLabelSprite(
          "2F 連絡スカイブリッジ",
          "#0284c7",
        );
        label.position.set(x, h + 0.8, z);
        group.add(label);
      } else {
        mesh.position.set(x, y + h / 2, z);
        group.add(mesh);
      }

      this.rootGroup.add(group);
    }
  }

  private createTextLabelSprite(
    text: string,
    accentColor: string,
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    // Background pill
    ctx.fillStyle = this.isDarkTheme
      ? "rgba(15, 23, 42, 0.85)"
      : "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.roundRect(8, 12, 240, 40, 10);
    ctx.fill();

    // Border line
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.fillStyle = this.isDarkTheme ? "#f8fafc" : "#0f172a";
    ctx.font = 'bold 18px "Noto Sans JP", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32, 224);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6, 1.5, 1);
    return sprite;
  }

  private createFloorBadgeSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = this.isDarkTheme
      ? "rgba(30, 41, 59, 0.9)"
      : "rgba(241, 245, 249, 0.9)";
    ctx.beginPath();
    ctx.roundRect(5, 10, 118, 44, 8);
    ctx.fill();

    ctx.strokeStyle = this.isDarkTheme ? "#38bdf8" : "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = this.isDarkTheme ? "#38bdf8" : "#1d4ed8";
    ctx.font = 'bold 21px "Outfit", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 32, 108);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.5, 1.75, 1);
    return sprite;
  }

  /** All selectable meshes use the same emissive selection state. */
  public highlightPlace(placeId: string | null) {
    for (const [id, record] of this.placeMaterials) {
      const material = record.mesh.material as THREE.MeshStandardMaterial;
      const selected = id === placeId;
      material.emissive.setHex(
        selected ? (this.isDarkTheme ? 0x38bdf8 : 0xf59e0b) : 0,
      );
      material.emissiveIntensity = selected ? 0.8 : 0;
      material.opacity = selected ? 1 : record.baseOpacity;
    }
    this.selectedPlaceId = placeId;
  }

  public setDarkTheme(isDark: boolean) {
    this.isDarkTheme = isDark;

    // Refresh materials
    for (const record of this.roomMeshRecords.values()) {
      const mat = record.mesh.material as THREE.MeshPhysicalMaterial;
      mat.transmission = isDark ? 0.3 : 0.45;
      mat.opacity = isDark ? 0.75 : 0.85;
      const place = this.placeMaterials.get(record.room.id);
      if (place) place.baseOpacity = mat.opacity;

      const edgeMat = record.edgeLine.material as THREE.LineBasicMaterial;
      edgeMat.color.setHex(isDark ? 0x38bdf8 : 0x1e3a8a);
      edgeMat.opacity = isDark ? 0.8 : 0.6;
    }

    // Re-highlight if needed
    this.highlightPlace(this.selectedPlaceId);
  }

  public getRoomPosition(roomId: string): THREE.Vector3 | null {
    const record = this.roomMeshRecords.get(roomId);
    if (!record) return null;

    const worldPos = new THREE.Vector3();
    record.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  private createVerticalFacilityMarker(
    node: NavNode,
    bldg: Building,
  ): THREE.Group {
    const group = new THREE.Group();
    const [localX, localZ] = worldToLocal(bldg, node.position);
    const isStairs = node.type === "stairs";
    const colorHex = isStairs
      ? this.isDarkTheme
        ? 0xf59e0b
        : 0xd97706
      : this.isDarkTheme
        ? 0x06b6d4
        : 0x0284c7;

    // Shaft box
    const shaftGeo = new THREE.BoxGeometry(3.6, 3.2, 3.6);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      transparent: true,
      opacity: isStairs ? 0.45 : 0.55,
      roughness: 0.25,
      metalness: 0.1,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(localX, 1.6, localZ);
    shaft.receiveShadow = true;
    shaft.castShadow = true;
    group.add(shaft);

    // Edges
    const edgeGeo = new THREE.EdgesGeometry(shaftGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: colorHex,
      linewidth: 2,
    });
    const edge = new THREE.LineSegments(edgeGeo, edgeMat);
    edge.position.copy(shaft.position);
    group.add(edge);

    // Floating text label
    const labelText = isStairs ? "🪜 階段" : "🛗 EV";
    const label = this.createTextLabelSprite(
      labelText,
      isStairs ? "#f59e0b" : "#06b6d4",
    );
    label.position.set(localX, 3.6, localZ);
    label.scale.set(isStairs ? 4.2 : 3.6, 1.3, 1);
    group.add(label);

    return group;
  }

  public getNodeWorldPosition(node: NavNode): THREE.Vector3 {
    const pos = new THREE.Vector3(
      node.position[0],
      node.position[1],
      node.position[2],
    );
    if (node.buildingId && node.floor !== undefined) {
      const floorKey = `${node.buildingId}_f${node.floor}`;
      const floorGroup = this.floorGroups.get(floorKey);
      if (floorGroup) {
        const baseElev = (floorGroup.userData.baseElevation as number) || 0;
        const dy = floorGroup.position.y - baseElev;
        pos.y += dy;
      }
    } else if (node.floor === 2 && this.skyBridgeGroup) {
      const baseElev =
        (this.skyBridgeGroup.userData.baseElevation as number) || 4.5;
      const dy = this.skyBridgeGroup.position.y - baseElev;
      pos.y += dy;
    }
    return pos;
  }
}
