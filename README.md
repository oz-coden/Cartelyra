# Uniview

日本語の説明は[目次](#目次)から読めます。

A static, browser-side campus map and reference route planner for Kanagawa University’s Yokohama Campus. 

The map data is transcribed from a campus layout plan and photographs of posted Building 3 floor plans. It is **unofficial and not field verified**. Floor plans are schematic; dimensions, heights, entrances, facility availability and access restrictions have not been surveyed.

- Campus overview: 30 selectable building locations and four searchable/selectable gates. Buildings without floor data show an explicit unregistered state; outdoor routes are not registered.
- Building 3: B2, B1, 1F, 2F, 3F and 4F; 35 main rooms, 34 with provisional route connections. Room `3-B202` has no route connection because its entrance is unclear.
- SVG floor maps with building/floor selection, keyboard picking, pan/zoom and searchable rooms, facilities and gates. Building 3 includes 17 WCs (male, female and multipurpose), an AED, elevators and stairs. Facility entrances and availability are provisional.
- Shared place indexing and building-local state power search, map selection, facility lists and building-aware route steps. Additional authored buildings load from JSON without per-building UI code. Selection and route actions are shared across views; picking a place does not move the 3D camera.
- Optional Three.js view generated from the same polygons, including atrium holes. The 3D bundle loads only when selected and pauses while hidden; the default SVG view works without WebGL.
- Shortest schematic route, stair avoidance, indoor preference and stairs preference. Stair avoidance does **not** certify wheelchair accessibility.
- Distances and walking times display “未測定” (not measured). Inferred connections can be excluded; no field-verified route network exists yet.

## Develop and check

Use Node.js 20.19 or newer and npm. Node.js is a development/build dependency, not a production application server.

```bash
git clone https://github.com/oz-coden/Uniview.git
cd Uniview
npm ci
npm run dev
```

```bash
npm run validate:data  # source references, IDs, connectivity and geometric checks
npm test               # DOM integration, facility routing and all-room-pair optimality checks
npm run build          # validation, TypeScript and static build
npm run preview        # serve the built output locally
```

Deploy the contents of `dist/` to a static host such as GitHub Pages. Vite uses relative asset paths. The included deployment workflow requires GitHub Pages to be configured to use GitHub Actions.

## Data maintenance

Data lives under `src/data/`, split into a campus manifest, overview, building records and per-floor JSON files. Shared compiler code transforms building-local geometry and navigation nodes into world coordinates for 3D rendering and route search. Files are discovered at build time; no database, API key or runtime backend is required.

See [Data authoring and verification](docs/data-authoring.md) for file paths, coordinate conventions, an editing example, provenance and remaining survey tasks. See [requirements and interaction rules](docs/requirements.md) for the product scope and shared selection/3D behavior. See [Architecture and review notes](docs/architecture-review.md) for the current structure, resolved review findings and verification limits. A graphical map editor and complete campus routing are future work.

## References

Kanagawa University publishes the campus map and barrier-free/AED map on its [Yokohama Campus information page](https://www.kanagawa-u.ac.jp/aboutus/information/facilities/yokohama/).

## License

This project is released under the [MIT License](LICENSE).

---

# Uniview

## 目次

1. [概要](#概要)
2. [開発背景](#開発背景)
3. [機能](#機能)
4. [使い方](#使い方)
5. [前提・依存](#前提依存)
6. [導入方法](#導入方法)
7. [設定](#設定)
8. [ライセンス](#ライセンス)
9. [クレジット](#クレジット)

## 概要  

**Uniview** は、神奈川大学 横浜キャンパスの建物配置・フロア図と、参考経路を表示する静的なWebアプリです。表示・検索・経路計算はブラウザー内で行います。

キャンパスマップ、フロアマップをもとにした**非公式の試作版**です。現時点では、実寸・出入口・階段／EVの接続・利用制限などは確認していません。

## 登録範囲と操作

| 対象 | 現在の状態 |
| --- | --- |
| キャンパス全体 | 30棟と4か所の門を選択可能。屋外経路は未登録 |
| 3号館 | B2・B1・1F・2F・3F・4Fの模式図 |
| 主要室 | 35室。うち34室に入口と通路の推定接続を登録 |
| WC・設備 | WC 17か所、AED 1か所、EV・階段を検索・選択可能。接続未登録の場所への経路提示なし |
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

選択した場所は地図側の共通カードに表示し、「ここから出発」「ここへ行く」で指定できます。操作仕様と拡張範囲は[要件と操作仕様](docs/requirements.md)を参照してください。

3Dは必要時に読み込むため、WebGLが利用できない環境でも平面図を利用できます。

## 編集方法

各階のJSONを編集すると、平面図・3D・検索・設備一覧・経路計算に共通して反映されます。他棟も建物・階のJSONを追加して登録できます。座標、出典、確認状態の扱いと具体例は [データ編集ガイド](docs/data-authoring.md) を参照してください。

今後の開発対象には、地図と現地の照合、入口・階段・EVの確認、実寸の校正、屋外経路・他棟の登録、図面を下敷きにした編集ツールがあります。

## 公開方法

Node.js 20.19以上とnpmで、次のコマンドを実行します。`npm run build` はデータ検証・型検査・静的ファイル生成を行い、`dist/` が出力されます。

GitHub Pagesで公開する場合は、リポジトリの **Settings → Pages → Build and deployment → Source → GitHub Actions** を設定します。

## 参考資料

神奈川大学公式の[横浜キャンパス紹介ページ](https://www.kanagawa-u.ac.jp/aboutus/information/facilities/yokohama/)には、キャンパスマップとバリアフリー・AEDマップが掲載されています。

## ライセンス

This project is released under the [MIT License](LICENSE).
