# Uniview

日本語の説明は[目次](#目次)から読めます。

## Contents

1. [Overview](#overview)
2. [Coverage and usage](#coverage-and-usage)
3. [Editing map data](#editing-map-data)
4. [Deployment](#deployment)
5. [References](#references)
6. [License](#license)

## Overview

**Uniview** is a static web application that displays building layouts, floor plans and reference routes for Kanagawa University’s Yokohama Campus. Rendering, search and route calculation run in the browser.

It is an **unofficial prototype** based on campus and floor maps. Actual dimensions, entrances, stair/elevator connections and access restrictions have not yet been verified.

## Coverage and usage

| Area | Current coverage |
| --- | --- |
| Campus | 30 buildings and four gates can be selected. Outdoor routes are not registered |
| Building 3 | Schematic plans for B2, B1, 1F, 2F, 3F and 4F |
| Building 3 rooms | 35 rooms; 34 have inferred entrance and corridor connections |
| Building 20 | 1F–4F; 108 numbered room areas, nine WCs, stairs, elevators and three 1F building entrances. Reference routes reach 95 rooms at their corridor side and 13 inner rooms at an explicitly named front room |
| WCs and facilities | 26 WCs (17 in Building 3, nine in Building 20), one AED, elevators and stairs can be searched and selected. No routes are shown to places without registered connections |
| 3-B202 | Can be selected and set as an endpoint. No route is shown because its entrance is not registered |
| Basement equipment areas and pits | Display only; excluded from route search |
| Actual distances and walking times | Not measured |

1. Select a building using the building selector or campus map, then use the floor buttons to change floors. Buildings without floor data display their registration status.
2. Switch views using “キャンパス” (campus), “平面図” (floor plan) and “3D” at the top. Drag the floor plan to pan, and use the mouse wheel or +/− buttons to zoom.
3. Enter a room name or a term such as “WC”, “トイレ” (toilet), “EV” or “正門” (main gate) in the start/destination field, then select a suggestion. Space-separated queries such as “3号館 2F 女性” (Building 3, 2F, female) are supported. Suggestions prioritize the current building and floor.
4. Alternatively, select a place on the map or in “このフロアの場所” (places on this floor), then choose “ここから出発” (start here) or “ここへ行く” (go here). Places without registered entrances or outdoor routes can be saved as endpoints, but no routes to them are shown.
5. Select a route-step card to switch to its building and floor. In 3D, use “全階を表示” (show all floors) and “階の間隔” (floor spacing). Moving the spacing slider enables all-floor view.
6. Disable “未確認の接続を含む参考ルート” (reference routes including unverified connections) to search only field-verified connections. Since connections have not yet been field verified, routes between different places will not be found in this mode.

“最短” (shortest) minimizes distance in the registered schematic coordinates; it does not guarantee the shortest actual route. “階段を避ける” (avoid stairs) simply excludes stair connections and does not guarantee wheelchair accessibility.

Routes stop at representative points on the corridor side of rooms; they do not locate individual doors. For inner rooms, the map data explicitly names a front room where guidance ends. The selection bubble, route summary and steps identify this limit; no route traverses the front room. Building entrances connect to indoor routes only until outdoor paths are registered.

A speech bubble appears at the selected place on the map, with “ここから出発” (start here) and “ここへ行く” (go here) actions. It follows map panning/zooming, 3D rotation and floor expansion without changing the page layout or scroll position. Near map edges it stays within the map area; it is hidden while the selected position is offscreen or on a hidden floor. See [requirements and interaction rules](docs/requirements.md) for interaction details and scope.

The 3D view loads on demand, so the floor plan remains available without WebGL.

## Editing map data

Editing a floor’s JSON updates the floor plan, 3D view, search, facility list and route calculation together. Additional buildings can be registered by adding building and floor JSON files. See [Data authoring and verification](docs/data-authoring.md) for coordinate conventions, sources, verification status and examples.

See [Building 20 transcription checks](docs/building-20-review.md) for unresolved room numbers/names and connectivity.

Future work includes comparing the map with the campus, verifying entrances/stairs/elevators, calibrating dimensions, registering outdoor routes and other buildings, and creating an editor with floor-plan underlays.

## Deployment

Use Node.js 20.19 or newer and npm to run the following commands. `npm run build` validates map data, checks types and generates static files in `dist/`.

```bash
git clone https://github.com/oz-coden/Uniview.git
cd Uniview
npm ci
npm run dev           # Start the development server
npm run validate:data # Validate map data
npm test              # Run automated tests
npm run build         # Validate, type-check and generate static files
npm run preview       # Preview the build locally
```

Deploy the contents of `dist/` to a static host. Node.js is needed for development/builds; a production application server is not required.

For GitHub Pages, set the repository’s **Settings → Pages → Build and deployment → Source → GitHub Actions**.

## References

Kanagawa University’s official [Yokohama Campus information page](https://www.kanagawa-u.ac.jp/aboutus/information/facilities/yokohama/) provides the campus map and barrier-free/AED map.

## License

This project is released under the [MIT License](LICENSE).

---

# Uniview

## 目次

1. [概要](#概要)
2. [登録範囲と操作](#登録範囲と操作)
3. [編集方法](#編集方法)
4. [公開方法](#公開方法)
5. [参考資料](#参考資料)
6. [ライセンス](#ライセンス)

## 概要

**Uniview** は、神奈川大学 横浜キャンパスの建物配置・フロア図と、参考経路を表示する静的なWebアプリです。表示・検索・経路計算はブラウザー内で行います。

キャンパスマップ、フロアマップをもとにした**非公式の試作版**です。現時点では、実寸・出入口・階段／EVの接続・利用制限などは確認していません。

## 登録範囲と操作

| 対象 | 現在の状態 |
| --- | --- |
| キャンパス全体 | 30棟と4か所の門を選択可能。屋外経路は未登録 |
| 3号館 | B2・B1・1F・2F・3F・4Fの模式図 |
| 3号館の主要室 | 35室。うち34室に入口と通路の推定接続を登録 |
| 20号館 | 1〜4F・108室区画、WC 9か所・階段・EV・1F出入口3か所。95室は通路側まで、奥の13室は指定した手前の部屋まで参考案内 |
| WC・設備 | WC 26か所（3号館17・20号館9）、AED 1か所、EV・階段を検索・選択可能。接続未登録の場所への経路提示なし |
| 3-B202 | 選択・端点指定は可能。入口未登録のため経路提示なし |
| 地下設備区画・ピット | 表示のみ。経路検索の対象外 |
| 実距離・徒歩時間 | 未測定 |

1. 建物選択またはキャンパス図で棟を選び、階ボタンで表示階を切り替えます。フロア未登録の棟には登録状況を表示します。
2. 上部の「キャンパス」「平面図」「3D」で表示を切り替えます。平面図はドラッグで移動、ホイールまたは＋／−で拡大縮小できます。
3. 出発地・目的地に部屋名や「WC」「トイレ」「EV」「正門」などを入力し、候補を選びます。「3号館 2F 女性」のような空白区切りの検索も可能です。候補は表示中の棟・階を優先します。
4. 地図や「このフロアの場所」の場所を選び、「ここから出発」「ここへ行く」で指定することもできます。入口や屋外経路が未登録の場所も端点に指定できますが、その場所への経路は表示しません。
5. 道順カードを選ぶと、その棟・階へ切り替わります。3Dでは「全階を表示」と「階の間隔」を利用できます。スライダーを動かすと全階表示に切り替わります。
6. 「未確認の接続を含む参考ルート」を外すと、現地確認済みの接続だけで検索します。現状は接続未確認のため、別地点への経路は見つかりません。

「最短」は登録座標上の距離を最小化して経路を探します。ただし座標は模式図のため、実際の最短距離を保証するものではありません。「階段を避ける」機能は、単に階段接続を除外する機能で、車椅子等での通行可否を保証するものではありません。

部屋への案内は通路側の代表点までで、個々の扉の位置を示すものではありません。奥の部屋はデータで指定した手前の部屋まで案内し、その範囲を吹き出し・経路概要・道順に表示します。手前の部屋の室内を通り抜ける経路は作成しません。建物出入口は館内経路へ接続し、屋外経路は別途登録します。

選択した場所には地図上の吹き出しを表示し、「ここから出発」「ここへ行く」で指定できます。吹き出しは地図の移動・拡大縮小や3Dの回転・階の展開に追従し、表示のためにページのレイアウトやスクロール位置を変更しません。地図の端では表示範囲内に収め、選択位置が画面外や非表示の階にある間は吹き出しを隠します。操作仕様と拡張範囲は[要件と操作仕様](docs/requirements.md)を参照してください。

3Dは必要時に読み込むため、WebGLが利用できない環境でも平面図を利用できます。

## 編集方法

各階のJSONを編集すると、平面図・3D・検索・設備一覧・経路計算に共通して反映されます。他棟も建物・階のJSONを追加して登録できます。座標、出典、確認状態の扱いと具体例は [データ編集ガイド](docs/data-authoring.md) を参照してください。

20号館の室番号・室名と接続の確認項目は、[20号館の図面登録と確認項目](docs/building-20-review.md)を参照してください。

今後の開発対象には、地図と現地の照合、入口・階段・EVの確認、実寸の校正、屋外経路・他棟の登録、図面を下敷きにした編集ツールがあります。

## 公開方法

Node.js 20.19以上とnpmで、次のコマンドを実行します。`npm run build` はデータ検証・型検査・静的ファイル生成を行い、`dist/` が出力されます。

```bash
git clone https://github.com/oz-coden/Uniview.git
cd Uniview
npm ci
npm run dev           # 開発サーバーを起動
npm run validate:data # 地図データを検証
npm test             # 自動テストを実行
npm run build        # 検証・型検査・静的ファイル生成
npm run preview      # ビルド結果をローカルで確認
```

`dist/` の内容を静的ホスティングに配置します。Node.jsは開発・ビルド時に必要で、公開用のアプリケーションサーバーは不要です。

GitHub Pagesで公開する場合は、リポジトリの **Settings → Pages → Build and deployment → Source → GitHub Actions** を設定します。

## 参考資料

神奈川大学公式の[横浜キャンパス紹介ページ](https://www.kanagawa-u.ac.jp/aboutus/information/facilities/yokohama/)には、キャンパスマップとバリアフリー・AEDマップが掲載されています。

## ライセンス

This project is released under the [MIT License](LICENSE).
