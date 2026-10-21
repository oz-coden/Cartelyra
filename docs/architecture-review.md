# Architecture and review notes

Uniview is a static Vite/TypeScript application. Campus JSON is compiled at build time and loaded in the browser; search and route computation require no backend or database. The default SVG view works without WebGL. Three.js is imported only for the 3D view.

## Shared data and state

- `data/compile.ts` qualifies navigation IDs and transforms building-local geometry into world coordinates. Optional campus connections join explicitly authored building entrances.
- `data/places.ts` indexes rooms, WCs, elevators, stairs, AEDs, remaining preset locations and campus gates. One place record supplies names, aliases, building/floor context and an optional routing node to every interface.
- `ui/LocationState.ts` keeps building and floor together, remembers each building's last floor and handles missing data without substituting another building's map.
- `ui/FloorMap.ts`, `ui/SearchPanel.ts` and `scene/ThreeView.ts` render and select those shared places. Route endpoint names can be selected independently of connectivity; only explicit navigation nodes can produce routes.
- `pathfinding/AStar.ts` uses Dijkstra search (zero heuristic). Preference costs and explicit edge distances therefore preserve optimality. Each guide step carries its building ID and floor.

Building metadata and per-floor JSON are discovered automatically. No building-specific condition is needed in search, the floor controls, map selection or the 3D view. The campus overview can include buildings whose floors have not yet been registered.

`ui/SelectionState.ts` stores the selected place and pending endpoint target. `ui/ThreeDisplayState.ts` stores the 3D display mode and gap independently. Selecting a place or calculating a route does not change the camera or collapse an expanded view. `SelectionPopover` overlays the map stage and follows projected place positions in SVG and 3D without affecting document layout. Room and facility meshes share one emissive-material registry. `SceneHost` separates rendering from ThreeView interaction so the complete selection/route flow can be tested without a GPU.

See [requirements and interaction rules](requirements.md) for the product scope and state-transition rules.

## Review findings and resolutions

| Area | Finding | Current behavior |
| --- | --- | --- |
| Building selection | UI labels and floor lookups assumed Building 3 or the first building | A catalog merges overview and authored buildings; 30 overview buildings are selectable and missing floors show an explicit empty state |
| Floor identity | Equal floor numbers from different buildings could share controls or route markers | Building ID and floor are selected together; marker rendering filters both |
| Facilities | WCs were decorative polygons and absent from route selection | WCs, AEDs, elevators and stairs share the place index, map interaction, search and floor facility list |
| Provisional entrances | Facility centers could be mistaken for route endpoints | Only explicit entrance/approach node references enable route computation; WC and AED connections remain inferred |
| Indoor floor boundaries | Outdoor stair symbols had been excluded while their floor slabs and some outdoor shortcuts remained | Indoor outlines omit outdoor extensions; Building 3 2F uses the central or west corridor, and walk edges cannot cross stair/elevator footprints |
| WC geometry | The male-WC polygon overlapped the multipurpose-WC area on upper floors | The male-WC outline follows a notch around the multipurpose area |
| Guide navigation | Steps retained floor numbers without building context | Steps preserve building ID and can switch the displayed building and floor |
| Temporary closures | Blocking an edge could cause the authoring validator to reject a disconnected network | Structural connectivity includes registered blocked edges; route search still excludes them |
| Keyboard and text rendering | Guide cards were clickable divs and inserted instruction text as HTML | Guide cards are native buttons and instructions use text nodes; SVG places/buildings and search support keyboard choice |
| Pick mode | Input and map selection could leave pick state out of sync | A shared SelectionState owns the selected place and pick target; SearchPanel clears the target after endpoint selection or cancellation |
| Browser storage | Theme initialization could fail when local storage was unavailable | Storage failures are tolerated and theme switching works for the current visit |
| Responsive layout | Fixed overlays made map, guide and details compete for space | Grid/flex sections place controls, map, routing and facilities in desktop/mobile layouts; selected-place details use an anchored overlay within the map |
| Gate selection | Gates were non-interactive labels | Gate IDs and campus-scoped places support search, keyboard/map selection and named endpoints without fabricating routes |
| 3D gap controls | Slider appeared enabled in single-floor mode but had no visible effect | Slider changes select all-floor mode and retain the chosen gap independently of place selection |
| 3D feedback/actions | Only rooms had emissive highlights, and actions were below the sidebar list | All selectable meshes share highlighting and the action bubble follows the selected place on the map; selection does not move the camera |
| 3D selection | Hidden floors or buildings could still be raycast targets; facilities were not selectable | Picker checks ancestor visibility and includes facility meshes; focused display shows the selected building/floor |
| 3D coordinates/resources | Level zero was treated as absent; camera assumed one building; route materials were not fully disposed | Level zero is valid, view fitting uses selected geometry, and discarded route resources and theme grids are disposed |
| Dependencies | The lockfile included an affected build-time `source-map-js` version | Lockfile resolves `source-map-js` 1.2.2; `npm audit` reports no known vulnerabilities at review time |

## Coverage and verification

The authored floor data covers Building 3 (six floors, 35 main rooms, 34 route-linked, 17 WCs and one AED) and Building 20 (four floors, 108 room areas and nine WCs). Building 20 has three 1F entrances and inferred indoor routes: 95 rooms are connected at their corridor side, and 13 inner rooms end at an explicitly named front room. Selection details and route summaries/steps identify that limit. See [Building 20 transcription checks](building-20-review.md) for pending labels and source limitations. EV/stair approach nodes are shared with facility places. Unclear entrances can be selected as named endpoints but have no route connections. Building 3 Stairs 3, 4 and 5 are excluded from indoor maps and place selection; its Stair 4 approaches B1 from outside and is not an indoor 1F stair. Their outdoor floor extensions are omitted from the indoor outlines. The external opening on Building 3 2F is an outline notch, with no route along its outer edge; the right-side indoor corridors on 3F/4F are retained. All other buildings currently have overview geometry only. No outdoor or inter-building route is fabricated from the overview.

Automated checks cover source references and corridor geometry, every pair of routable rooms in four modes against an independent Floyd–Warshall result, facility reachability, provisional-only exclusions, synthetic additional buildings, cross-building connections, missing floors, level zero, SVG selection and marker isolation, keyboard search, endpoint editing, pick-state reset and safe text rendering. A DOM integration test loads the actual Vite entry point and exercises room-to-WC routing. CPU-side Three.js tests exercise WC mesh picking, visibility and level-zero position handling. An interaction test uses the actual app, ThreeView, picker and room/facility meshes with a headless SceneHost to verify 3D endpoint selection, shared actions, emissive highlighting, gap transforms and camera stability together.

DOM and CPU-side checks do not validate browser rendering. Separate Chromium checks at 320, 390, 900 and 1440 pixel viewport widths verify that place selection leaves the map position and page/workspace scroll unchanged, bubbles stay within map edges, endpoint actions work, and bubbles follow SVG zoom. Software WebGL checks verify 3D display and bubble tracking during camera rotation and floor expansion. Physical mobile devices, hardware GPU rendering, multi-touch behavior and screen-reader announcements still need device verification. The optional Three.js chunk remains approximately 570 kB before compression; it is not loaded for the default SVG map.

## Remaining map work

1. Compare transcribed polygons, labels and candidate entrances against current plans and the campus.
2. Verify doors, WC availability, access restrictions, stair continuity, elevator stops and accessible paths.
3. Register other buildings from their floor plans and record provenance.
4. Calibrate outdoor/indoor coordinates, distances and heights before publishing measured distances or cross-campus routes.

See [Data authoring and verification](data-authoring.md) for the JSON formats and building/facility registration workflow.
