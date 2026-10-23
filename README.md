# Uniview

日本語の説明は[目次](#目次)から読めます。

## Contents

1. [Overview](#overview)
2. [Coverage and usage](#coverage-and-usage)
3. [Editing map data](#editing-map-data)
4. [Deployment](#deployment)
5. [References](#references)
6. [Terms of use](#terms-of-use)

## Overview

**Uniview** is a static web application that displays building layouts, floor plans and reference routes for Kanagawa University’s Yokohama Campus. Rendering, search and route calculation run in the browser.

It is an **unofficial prototype** using aerial-photo observations for the campus overview and posted diagrams for indoor plans. Actual dimensions, entrances, stair/elevator connections and access restrictions have not yet been field verified.

## Coverage and usage

| Area | Current coverage |
| --- | --- |
| Campus | 30 buildings and four gates can be selected. A north-up overview uses simplified building shapes interpreted from aerial photos. Outdoor reference routes connect Buildings 1, 3, 5, 17, 19, 20 and 23 with East Gate, New East Gate and West Gate |
| Building 1 | B1–8F; 139 areas: 135 with direct corridor-side reference routes and four via named front rooms, 23 WCs, two stair cores and two elevators. Three 1F entrances; provisional access and field checks remain documented |
| Building 3 | Schematic plans for B2, B1, 1F, 2F, 3F and 4F; Building 8-facing and New East Gate-facing entrances on 1F |
| Building 3 rooms | 35 rooms; 34 have inferred entrance and corridor connections |
| Building 5 | 1F–4F; 39 numbered areas, four WCs, two stair cores and a 2F entrance reached by external stairs. Reference routes cover 33 rooms directly and six inner rooms via a named front room; the approaches to 5-308–5-312 are provisional and require field checks |
| Building 6 | 1F–4F; 68 areas: 66 direct corridor approaches and two via named front rooms, four WCs and inferred stairs. Entrances on 1F and 2F; inner-room approaches remain provisional. The 3F right wing may require a reference route via another floor |
| Buildings 7–10 | Connected floor-plan/3D group with 22 plans and 170 numbered areas, 30 WCs and one inferred EV core. The provisional 2F uses a 2023 reference PDF; 2024 posted photos take priority for existing room divisions and identifiers. 155 general-use labels use the older reference, supplemented by field information on the 2F cafeteria and the 10-33 dining space. Four inner areas use provisional front endpoints. Outdoor access uses stairs at Building 7 2F and Building 8 1F/2F; stair avoidance cannot reach the outdoor network |
| Building 17 | 1F–5F; 154 areas (151 direct approaches and three provisional front-room endpoints), 16 WCs, inferred stairs/elevators and three entrance places. Two 1F entrances connect to the Building 19-facing outdoor path; the 3F external connection is pending. The 1F section and 2F–5F section remain separate until their stair/EV correspondence is confirmed |
| Building 19 | B1–3F; 48 areas with reference routes, ten WCs, two inferred stair cores and a shop-side 1F entrance. The left-side corridor serves 19-104/107 separately from the shop side. Elevators connect B1, 2F and 3F without a public 1F boarding link; the shop entrance connects outdoors on the south side near the gap between Buildings 17 and 12 |
| Building 20 | 1F–4F; 108 numbered room areas, nine WCs, stairs, elevators and three 1F building entrances. Reference routes reach 95 rooms at their corridor side and 13 inner rooms at an explicitly named front room |
| Building 23 | B2–8F; ten floors and 286 areas: 255 direct corridor approaches and 31 provisional front-room endpoints. 28 WCs, three EV cores, inferred stairs and two 1F entrance places facing Buildings 15 and 20, both connected to outdoor reference routes |
| WCs and facilities | 141 WCs (23 in Building 1, 17 in Building 3, four each in Buildings 5 and 6, 30 in Buildings 7–10, 16 in Building 17, ten in Building 19, nine in Building 20, 28 in Building 23), one AED, elevators and stairs can be searched and selected. No routes are shown to places without registered connections |
| 3-B202 | Can be selected and set as an endpoint. No route is shown because its entrance is not registered |
| Basement equipment areas and pits | Display only; excluded from route search |
| Actual distances and walking times | Not measured |

1. Select a building using the building selector or campus map, then use the floor buttons to change floors. Buildings without floor data display their registration status.
2. Switch views using “キャンパス” (campus), “平面図” (floor plan) and “3D” at the top. Drag the floor plan to pan, and use the mouse wheel or +/− buttons to zoom.
3. Enter a room name or a term such as “WC”, “トイレ” (toilet), “EV” or “正門” (main gate) in the start/destination field, then select a suggestion. Space-separated queries such as “3号館 2F 女性” (Building 3, 2F, female) are supported. Suggestions prioritize the current building and floor.
4. Alternatively, select a place on the map or in “このフロアの場所” (places on this floor), then choose “ここから出発” (start here) or “ここへ行く” (go here). Places without registered entrances or outdoor routes can be saved as endpoints, but no routes to them are shown.
5. Select a route-step card to switch to its building and floor, or to the campus map for outdoor steps. In 3D, use “全階を表示” (show all floors) and “階の間隔” (floor spacing). Moving the spacing slider enables all-floor view.
6. Disable “未確認の接続を含む参考ルート” (reference routes including unverified connections) to search only field-verified connections. Since connections have not yet been field verified, routes between different places will not be found in this mode.

On schematic maps, endpoints in the same building first minimize vertical travel, then exits and re-entries, then the selected reference cost. Between different wings of a connected display group, known floor backtracking and overshoots are avoided before comparing reference costs; outdoor approaches with unmeasured stairs can therefore compete with longer interior routes. Other journeys between buildings or to outdoor places compare the selected reference cost directly, so a shorter reference route can use bridge stairs even when a stair-free detour exists. Reference costs are independent of drawing scale, position and rotation; they are not measured distances. “標準” (standard) does not guarantee the shortest actual route. Indoor preference distinguishes indoor, roofed and exposed/unknown connections. “階段を避ける” (avoid stairs) excludes stair connections and does not guarantee wheelchair accessibility. The summary identifies stairs, ramps and elevators even when the number of floor changes is unknown. If no stair-free route exists, a persistent notice accompanies an alternative that minimizes registered stair segments, then reference cost. Stair avoidance remains selected. Disconnected or unregistered endpoints receive a persistent explanation without an invented route.

Routes stop at representative points on the corridor side of rooms; they do not locate individual doors. For inner rooms, the map data explicitly names a front room where guidance ends. The selection bubble, route summary and steps identify this limit; no route traverses the front room. Explicitly registered public circulation areas, such as Building 19’s B1 dining room, hall and lounge, allow reference paths through their interiors; they use teal dashed zones in the floor plan and low zones in 3D. The outdoor reference route joins Building 3’s Building 8-facing entrance to Building 20’s rightmost entrance on the lower side of its floor plan, via West Gate and the avenue between Buildings 13 and 17. Building 1 connects through its Building 2-facing and East Gate-facing entrances. Building 5 connects through external stairs to its 2F entrance on the Building 7-facing side near Building 3; stair avoidance excludes this outdoor connection. New East Gate supports both the Building 3 1F passageway and the outdoor path between Buildings 2 and 3. East Gate connects to the path in front of Building 1 and directly to the Building 3 side along the east side of Building 2. The other two Building 20 entrances and Building 6 entrances remain unconnected outdoors. Main Gate connects through the path between Buildings 1 and 31. Outdoor segments appear on the campus map; indoor segments appear on their respective floor plans. Path widths are qualitative reference data and do not yet affect route selection. Ground paths do not connect to an elevated crossing unless an explicit transfer is registered.

Building 23’s two entrances connect through the ground path between Buildings 17 and 23. An elevated bridge runs from the Building 6 side near West Gate to the gap between Buildings 12 and 17, where stairs join the Building 23-side ground path. A separate stair connects the Building 19 shop-entrance approach to the 17/12 bridge corner. The Building 6 approach offers separate stair and ramp connections; the 12/17-side connection is stairs only. Stair avoidance therefore uses the existing ground detour for the complete journey. Blue lines show the bridge, orange lines show vertical connections, and faint background lines show surrounding roads simplified from aerial photos. The central road continues from between Buildings 6 and 19, past the 12/7, 10/12 and 15/9 gaps, to the southern road. Road strokes leave visible space around building footprints, and labels follow slender diagonal buildings or wrap inside tall, narrow footprints. The overview fits roads and gates as well as buildings. Road landmarks do not create routing connections; walking routes along streets require explicit graph edges. Heights, ramp gradients, pedestrian access and crossing locations remain unverified.

A speech bubble appears at the selected place on the map, with “ここから出発” (start here) and “ここへ行く” (go here) actions. It follows map panning/zooming, 3D rotation and floor expansion without changing the page layout or scroll position. Selecting a place within the current building or connected display group retains the 3D camera; selecting a place outside that display scope fits the new scope into view while preserving the floor display mode and spacing. Green/red 3D pins mark the actual route endpoints, while purple diamonds mark transitions to another floor or the outdoor route. Near map edges it stays within the map area; it is hidden while the selected position is offscreen or on a hidden floor. See [requirements and interaction rules](docs/requirements.md) for interaction details and scope.

Connected buildings can share a floor-plan/3D view while retaining their own building IDs and floor labels. Explicit display levels map corresponding floors, including different floor numbers; “連絡棟をまとめて表示” switches between grouped and individual views. Group membership creates no routes. Buildings 7–10 share 1F–6F display levels, with Building 10 included on 1F–4F. The provisional 2F uses a 2023 reference PDF; 2024 posted photos take priority for existing divisions and identifiers. General-use labels from the older PDF are historical, and personal names, extension numbers and research topics are omitted. Building 8 has adjacent EV stops and common stair links; other wings retain pending 1F stair correspondences. The 7/8 covered bridge starts on 3F: on 2F the Building 7 end uses an outdoor stair. Building 8 has a covered Map Hall stair toward Building 2, a shared outdoor landing between 1F/2F toward Building 25, and EV-side stairs into the enclosed courtyard. The south path reaches Main Gate between Buildings 1 and 31; the tunnel branch toward Building 11 has no registered onward exit. All group outdoor approaches require stairs. Room details and map captions use short labels. Source assumptions and pending checks are kept in [survey notes](docs/survey-notes.md). Guide cards summarize corridor runs and retain entrances, vertical transfers and destinations. See [Buildings 7–10 transcription checks](docs/buildings-7-10-review.md) for uncertain numbers, front-room approaches and connections.

The 3D view loads on demand, so the floor plan remains available without WebGL.

## Editing map data

Editing a floor’s JSON updates the floor plan, 3D view, search, facility list and route calculation together. Additional buildings can be registered by adding building and floor JSON files. See [Data authoring and verification](docs/data-authoring.md) for coordinate conventions, sources, verification status and examples.

The [outdoor reference and field-survey guide](docs/outdoor-survey.md) records the aerial source, drawing rules, unresolved positions and how to estimate distances from timed walks.

See [Building 1 transcription checks](docs/building-1-review.md), [Building 5 transcription checks](docs/building-5-review.md), [Building 6 transcription checks](docs/building-6-review.md), [Building 17 transcription checks](docs/building-17-review.md), [Building 19 transcription checks](docs/building-19-review.md), [Building 20 transcription checks](docs/building-20-review.md) and [Building 23 transcription checks](docs/building-23-review.md) for unresolved labels and connectivity. Building 1 has indoor reference routes using stairs or elevators, with three 1F entrances connected to outdoor reference routes. Building 5 connects to the campus network through its external-stair 2F entrance. Stair avoidance cannot reach other floors in Buildings 5 and 6 because no elevator is registered. Building 6 has indoor reference routes only; its grey areas and the 3F right-wing connection require field checks. Building 19 connects outdoors through its south-side shop entrance near the gap between Buildings 17 and 12; its 1F left/right corridor connection is unconfirmed, and elevator routing connects B1, 2F and 3F without boarding or alighting on 1F. The shop-side entrance connects to the ground reference path; the left-side entrance needs field verification.

Building 17 has routes within 1F and within 2F–5F. Nearby 1F openings are represented by one entrance place; the two 1F entrance places connect to the outdoor path facing Building 19. The 3F entrance remains unconnected outdoors. No link between those sections is assumed from ambiguous stair/EV positions. Pool showers and 17-540 use provisional front-room endpoints; the central unlabelled area is non-traversable without claiming an atrium or roof structure.

Building 23 has indoor reference routes from B2 to 8F. 23-B203 and 23-107 use provisional front-room endpoints at 23-B202 and 23-105 respectively, and the B2 lower stair has no public boarding link. 23-B203 retains its room number without an assigned use name; 23-225 is the hot-water and ice-making room. The 1F entrance places face Building 15 (entrance 1) and Building 20 (entrance 2); both connect through the ground path between Buildings 17 and 23.

Future work includes comparing the map with the campus, verifying entrances/stairs/elevators, calibrating dimensions, adding more outdoor routes and buildings, and creating an editor with floor-plan underlays.

## Deployment

Use Node.js 20.19 or newer and npm to run the following commands. `npm run build` validates map data, checks types and generates static files in `dist/`.

```bash
git clone https://github.com/oz-coden/Uniview.git
cd Uniview
npm ci
npm run dev           # Start the development server
npm run validate:data # Validate map data
npm run audit:data    # Report geometry and route review candidates
npm test              # Run automated tests
npm run build         # Validate, type-check and generate static files
npm run preview       # Preview the build locally
```

`audit:data` reports room containment/overlap, unjoined walk intersections, same-floor separation and avoidable floor changes. Its `campusCoverage` report checks all directed room pairs between registered buildings and separates missing endpoints, missing connections and mode restrictions. See [route coverage review](docs/route-coverage-review.md). Review candidates do not fail validation or builds, so intentional nested rooms remain allowed. Use `npm run audit:data -- --json audit-report.json` to save the details.

The GitHub Pages workflow runs regression tests before building and publishing; a failed test stops deployment.

Deploy the contents of `dist/` to a static host. Node.js is needed for development/builds; a production application server is not required.

For GitHub Pages, set the repository’s **Settings → Pages → Build and deployment → Source → GitHub Actions**.

## References

Kanagawa University’s official [Yokohama Campus information page](https://www.kanagawa-u.ac.jp/aboutus/information/facilities/yokohama/) provides the campus map and barrier-free/AED map.

The campus overview was created and simplified with reference to [GSI Tiles: seamless aerial photos](https://maps.gsi.go.jp/development/ichiran.html), retrieved on 21 October 2026 UTC. The capture date has not been identified; current entrances and access conditions require field checks.

## Terms of use

The public Uniview website is free to use for viewing maps, searching for places and finding routes.

The project does not grant a general license to freely copy, modify or redistribute its source code or map data beyond the permissions expressly provided in the [Uniview Terms of Use](LICENSE.md). Refer to those terms for uses beyond ordinary website use.

Rights in reference materials, third-party content and dependencies belong to their respective rights holders, and their applicable terms remain unchanged. Previously granted permissions, including MIT permissions for covered portions, remain in effect. Prior MIT notices and distributed dependency licenses are retained in the [license notices](public/licenses.txt).

---

# Uniview

## 目次

1. [概要](#概要)
2. [登録範囲と操作](#登録範囲と操作)
3. [編集方法](#編集方法)
4. [公開方法](#公開方法)
5. [参考資料](#参考資料)
6. [利用条件](#利用条件)

## 概要

**Uniview** は、神奈川大学 横浜キャンパスの建物配置・フロア図と、参考経路を表示する静的なWebアプリです。表示・検索・経路計算はブラウザー内で行います。

屋外配置は空中写真の観察、館内図は掲示案内図をもとにした**非公式の試作版**です。現時点では、実寸・出入口・階段／EVの接続・利用制限などの現地確認は完了していません。

## 登録範囲と操作

| 対象 | 現在の状態 |
| --- | --- |
| キャンパス全体 | 30棟と4か所の門を選択可能。空中写真を参考に外形を簡略化し、北を上に配置。1・3・5・17・19・20・23号館と東門・新東門・西門の屋外参考経路を登録 |
| 1号館 | B1〜8F・139区画。135区画へ直接、奥の4区画は指定した手前の部屋の通路側まで参考案内。WC 23か所・階段2系統・EV2基・1F出入口3か所。暫定的な進入関係と現地確認事項を記録 |
| 3号館 | B2・B1・1F・2F・3F・4Fの模式図。1Fに8号館側・新東門側の出入口 |
| 3号館の主要室 | 35室。うち34室に入口と通路の推定接続を登録 |
| 5号館 | 1〜4F・39室区画、WC 4か所・両端の階段・外階段から入る2F出入口。33室へ直接、奥の6室は指定した手前の部屋まで参考案内。5-308〜5-312の進入元は暫定推定 |
| 6号館 | 1〜4F・68区画。66区画へ直接、奥の2区画は指定した手前の部屋まで参考案内。WC 4か所・階段・1Fと2Fの出入口。3F右側へは他階を経由する参考経路となる場合あり |
| 7〜10号館 | 連絡棟として22フロア・170区画を一体表示。WC 30か所、EV 1系統を暫定対応。2Fは2023年参考PDFによる仮登録で、既存階の区画・室番号は2024年掲示写真を優先。155区画に旧資料の一般的用途を付記。2F食堂の存在と10-33の飲食スペースは現地情報で補足。奥の4区画は手前まで暫定案内。7号館2F・8号館1F/2Fから階段で屋外接続。階段回避では屋外へ到達不可 |
| 17号館 | 1〜5F・154区画。151区画へ直接、奥の3区画は指定した手前の部屋まで暫定案内。WC 16か所・階段・EV・出入口3か所。1Fの2出入口を19号館側の屋外通路へ参考接続。3Fの外部接続は保留。1Fと2〜5Fは階段・EVの対応確認まで別々に案内 |
| 19号館 | B1〜3F・48区画へ参考案内。WC 10か所・階段2系統・購買部側1F出入口。104・107は左側通路へ接続。EVは1Fで乗降せずB1・2F・3F間を案内。購買部側出入口を南側の17・12号館間の屋外通路へ参考接続 |
| 20号館 | 1〜4F・108室区画、WC 9か所・階段・EV・1F出入口3か所。95室は通路側まで、奥の13室は指定した手前の部屋まで参考案内 |
| 23号館 | B2〜8Fの10フロア・286区画。255区画へ直接、31区画は手前の部屋まで暫定案内。WC 28か所・EV3系統・階段・1F出入口2か所（15号館側・20号館側）を屋外参考経路へ接続 |
| WC・設備 | WC 141か所（1号館23・3号館17・5号館4・6号館4・7〜10号館30・17号館16・19号館10・20号館9・23号館28）、AED 1か所、EV・階段を検索・選択可能。接続未登録の場所への経路提示なし |
| 3-B202 | 選択・端点指定は可能。入口未登録のため経路提示なし |
| 地下設備区画・ピット | 表示のみ。経路検索の対象外 |
| 実距離・徒歩時間 | 未測定 |

1. 建物選択またはキャンパス図で棟を選び、階ボタンで表示階を切り替えます。フロア未登録の棟には登録状況を表示します。
2. 上部の「キャンパス」「平面図」「3D」で表示を切り替えます。平面図はドラッグで移動、ホイールまたは＋／−で拡大縮小できます。
3. 出発地・目的地に部屋名や「WC」「トイレ」「EV」「正門」などを入力し、候補を選びます。「3号館 2F 女性」のような空白区切りの検索も可能です。候補は表示中の棟・階を優先します。
4. 地図や「このフロアの場所」の場所を選び、「ここから出発」「ここへ行く」で指定することもできます。入口や屋外経路が未登録の場所も端点に指定できますが、その場所への経路は表示しません。
5. 道順カードを選ぶと、その棟・階へ切り替わります。屋外の道順ではキャンパス図へ切り替わります。3Dでは「全階を表示」と「階の間隔」を利用できます。スライダーを動かすと全階表示に切り替わります。
6. 「未確認の接続を含む参考ルート」を外すと、現地確認済みの接続だけで検索します。現状は接続未確認のため、別地点への経路は見つかりません。

模式図では、同じ棟の中は昇降の少なさ、不要な出入りの少なさ、選択条件の参考評価値の順に比較します。連絡棟群の別棟間では、既知の階移動の逆行・行き過ぎを避けたうえで参考評価値を比較し、昇降量未確認の階段を含む屋外経路も長い館内迂回と比較できます。それ以外の棟間・屋外への移動では参考評価値を直接比較し、階段のない迂回路があっても、参考評価値が小さい連絡橋の階段経由を選べます。参考評価値は描画の縮尺・位置・回転とは独立し、実距離を表しません。「標準」は実際の最短距離を保証しません。屋内優先では、屋内・屋根付き・屋外または未確認の接続を区別します。同階の接続がない場合は他階経由も可能です。概要には、昇降量が未確認でも階段・スロープ・EVの利用を表示します。「階段を避ける」は階段接続を除外する機能で、車椅子等での通行可否を保証するものではありません。階段なしでつながらない場合は注意を表示し、登録された階段区間が最少の代替経路を提示します。同数なら参考評価値で比較します。階段回避の選択は維持し、注意は検索条件を変えるまで残します。接続自体がない場合も理由を表示します。

部屋への案内は通路側の代表点までで、個々の扉の位置を示すものではありません。奥の部屋はデータで指定した手前の部屋まで案内し、その範囲を吹き出し・経路概要・道順に表示します。手前の部屋の室内を通り抜ける経路は作成しません。19号館B1の食堂・ホール・ラウンジのように、明示登録された公開の通行区画は区画内を通る参考経路を使います。平面図では青緑の破線、3Dでは低い区画で表示します。屋外参考経路は、3号館の8号館側出入口から西門、13号館と17号館の間の大通りを経て、20号館の図面下側・右端出入口へ接続しています。1号館の2号館側・東門側出入口、5号館の7号館側・3号館寄りの外階段から2F出入口へも参考接続します。5号館の屋外接続は階段回避では使いません。新東門からは3号館1Fの通り抜けと2・3号館間の屋外迂回路を使え、東門は1号館前の通路と2号館東側を通って3号館側へ抜ける直通路へ接続します。20号館の残り2か所・6号館の出入口は屋外未接続です。正門は1・31号館間の通路へ接続します。屋外区間はキャンパス図、館内区間は各階の図に表示します。道幅は定性的な参考情報として保持し、経路の優先度にはまだ反映しません。立体交差は、明示した階層間の接続がない限り地上の道と接続しません。

23号館の両出入口は、17号館・23号館間の地上通路へ参考接続します。6号館側から西門付近を経て12号館・17号館間へ続く連絡橋と、23号館側の地上通路へ降りる階段を登録します。19号館の購買部側出入口付近から17・12号館間の連絡橋へ上がる階段も登録します。6号館側は階段・スロープの別経路がありますが、12・17号館側は階段だけを登録するため、全区間の階段回避は既存の地上迂回路を使います。青線は連絡橋、橙線は昇降接続、薄い背景線は空中写真から簡略化した周辺道路です。中央の道路は6・19号館間から12・7号館間、10・12号館間、15・9号館間を経て南側の道路へ続きます。道路線と建物の間に表示上の余白を確保し、細長く斜めに建つ建物のラベルは向きに沿わせ、縦長で幅の狭い建物では折り返します。全体表示には道路と門の範囲も含めます。背景の道路線から経路は生成せず、道路沿いの歩行区間も経路データに明示して接続します。高低差・勾配・歩道・横断位置・通行条件は現地確認待ちです。

選択した場所には地図上の吹き出しを表示し、「ここから出発」「ここへ行く」で指定できます。吹き出しは地図の移動・拡大縮小や3Dの回転・階の展開に追従し、表示のためにページのレイアウトやスクロール位置を変更しません。同じ棟または表示中の連絡棟群の場所を選択した場合は3Dカメラを維持し、その範囲外の場所を選択した場合は階の表示モードと間隔を保って、新しい表示範囲を収めます。3Dの緑・赤のピンは実際の出発地・目的地を示し、紫のひし形は別の階や屋外への中継地点を示します。地図の端では表示範囲内に収め、選択位置が画面外や非表示の階にある間は吹き出しを隠します。操作仕様と拡張範囲は[要件と操作仕様](docs/requirements.md)を参照してください。

連絡棟は棟IDと階名を保持したまま、平面図・3Dをまとめて表示できます。対応する階を明示するため、異なる階番号同士の接続にも対応します。「連絡棟をまとめて表示」で一体表示と単棟表示を切り替えます。所属だけを根拠に経路は作りません。7〜10号館は1〜6Fの対応するフロアを一体表示し、10号館は1〜4Fを含めます。2Fは2023年の参考PDFによる仮登録です。既存階の区画・室番号は2024年の掲示写真を優先し、旧資料の一般的用途を履歴情報として補足します。個人名・内線番号・研究テーマは含めません。8号館のEVと共用階段は隣接する登録階を仮接続し、他棟の1F階段との対応は確認待ちです。7・8号館の屋根付き直通は3F以上で、2Fの7号館側は外階段です。8号館には2号館側のマップホール外階段（屋根付き）、1F・2F間の25号館側屋外踊り場への階段、EV脇から中庭へ出る階段を登録しています。南側は1・31号館間から正門へつながり、11号館側の地下通路は先の接続を保留しています。棟群と屋外の移動には階段が必要です。部屋・設備の説明と地図の注記は短くし、出典・仮定・確認事項は[資料・調査記録](docs/survey-notes.md)に分けています。道順は通路内の移動をまとめ、出入口・階段・目的地を表示します。番号・進入元・接続の確認項目は[7〜10号館の図面登録と確認項目](docs/buildings-7-10-review.md)に記録しています。

3Dは必要時に読み込むため、WebGLが利用できない環境でも平面図を利用できます。

## 編集方法

各階のJSONを編集すると、平面図・3D・検索・設備一覧・経路計算に共通して反映されます。他棟も建物・階のJSONを追加して登録できます。座標、出典、確認状態の扱いと具体例は [データ編集ガイド](docs/data-authoring.md) を参照してください。

空中写真の出典、独自の描画ルール、未確定の位置と歩行時間からの距離推定は、[屋外配置と現地計測](docs/outdoor-survey.md)にまとめています。

室番号・室名と接続の確認項目は、[1号館の図面登録と確認項目](docs/building-1-review.md)、[5号館の図面登録と確認項目](docs/building-5-review.md)、[6号館の図面登録と確認項目](docs/building-6-review.md)、[17号館の図面登録と確認項目](docs/building-17-review.md)、[19号館の図面登録と確認項目](docs/building-19-review.md)、[20号館の図面登録と確認項目](docs/building-20-review.md)と[23号館の図面登録と確認項目](docs/building-23-review.md)を参照してください。1号館は階段・EVで館内を参考案内し、1Fの3出入口を屋外参考経路へ接続します。5号館は外階段から入る2F出入口を屋外参考経路へ接続します。5号館・6号館はEV未登録のため、階段を避ける条件では別の階へ案内できません。6号館は屋外未接続で、灰色区画と3F右側への進入関係は現地確認待ちです。19号館は南側の17・12号館間に面する購買部側出入口から屋外へ参考接続し、1Fの左右通路の接続は未確認、EVは1Fで乗降せずB1・2F・3F間を案内します。購買部側出入口は館内と屋外の地上通路へ接続し、左側通路の出入口は現地確認待ちです。

17号館は1F内と2〜5F内を別々に参考案内します。1Fの近接する2開口を一つの案内地点にまとめ、2か所の出入口を19号館側の屋外通路へ参考接続します。3F出入口は屋外未接続です。階段・EVの対応が不明なため、両者を推測で接続しません。プールのシャワー室と17-540は手前の部屋までの暫定案内とし、中央の無記名区画は構造を断定せず非通行区画としています。

23号館はB2〜8Fを館内参考案内します。23-B203は23-B202、23-107は23-105の通路側まで暫定案内します。B2下側階段は共用通路への乗降未登録です。23-B203は用途名を付けず室番号だけを保持し、23-225は給湯・製氷室として登録します。1F出入口1は15号館側、出入口2は20号館側に面し、17号館・23号館間の地上通路から両出入口へ参考接続します。

今後の開発対象には、地図と現地の照合、入口・階段・EVの確認、実寸の校正、屋外経路の拡充・他棟の登録、図面を下敷きにした編集ツールがあります。

## 公開方法

Node.js 20.19以上とnpmで、次のコマンドを実行します。`npm run build` はデータ検証・型検査・静的ファイル生成を行い、`dist/` が出力されます。

```bash
git clone https://github.com/oz-coden/Uniview.git
cd Uniview
npm ci
npm run dev           # 開発サーバーを起動
npm run validate:data # 地図データを検証
npm run audit:data    # 配置・接続・経路の確認候補を報告
npm test             # 自動テストを実行
npm run build        # 検証・型検査・静的ファイル生成
npm run preview      # ビルド結果をローカルで確認
```

部屋の包含・重なり、通路の交差点、同階の分離、不自然な階移動は `audit:data` で報告します。`campusCoverage` は登録済み建物間の全室ペアを方向別に点検し、案内地点なし・接続なし・条件による除外を分けて集計します。[経路の接続状況](docs/route-coverage-review.md)も参照してください。意図した入れ子構造も扱えるように、確認候補だけでは検証・ビルドを失敗させません。`npm run audit:data -- --json audit-report.json` で詳細を保存できます。

GitHub Pagesの公開ワークフローは、ビルド・公開前に回帰テストを実行します。テストが失敗した場合は公開を停止します。

`dist/` の内容を静的ホスティングに配置します。Node.jsは開発・ビルド時に必要で、公開用のアプリケーションサーバーは不要です。

GitHub Pagesで公開する場合は、リポジトリの **Settings → Pages → Build and deployment → Source → GitHub Actions** を設定します。

## 参考資料

神奈川大学公式の[横浜キャンパス紹介ページ](https://www.kanagawa-u.ac.jp/aboutus/information/facilities/yokohama/)には、キャンパスマップとバリアフリー・AEDマップが掲載されています。

キャンパス図は[国土地理院の地理院タイル「全国最新写真（シームレス）」](https://maps.gsi.go.jp/development/ichiran.html)（2026年10月21日 UTC取得）を参考に、簡略化・加工して作成しています。撮影年月は未特定で、現在の入口・通行条件は現地照合が必要です。

## 利用条件

Univiewの公開サイトは、地図の閲覧、場所の検索や経路検索に無料で利用できます。

ソースコードおよび地図データについて、[Uniview 利用条件](LICENSE.md)で明示する範囲を超えて、自由な複製・改変・再配布を認める包括的な許諾は行っていません。通常のサイト利用を超える利用については、利用条件を確認してください。

参照資料・第三者のコンテンツ・依存ライブラリの権利は、それぞれの権利者に帰属し、各提供元の利用条件が適用されます。本プロジェクトの利用条件によって、これらは変更されません。過去にMIT License等で許諾された部分については、従前の許諾が引き続き適用されます。従前のMIT表示と配布する依存ライブラリのライセンス全文は、[ライセンス表示](public/licenses.txt)に収録しています。
