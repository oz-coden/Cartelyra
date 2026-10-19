# Uniview

A static, browser-side campus map and reference route planner for Kanagawa University’s Yokohama Campus. [日本語はこちら](#日本語).

This prototype transcribes user-supplied campus and Building 3 floor-plan photographs. It is **unofficial and not field verified**. Floor plans are schematic; dimensions, heights, entrances, facility availability and access restrictions have not been surveyed.

- Campus overview: approximate building locations; outdoor routes are not registered.
- Building 3: B2, B1, 1F, 2F, 3F and 4F; 35 main rooms, 34 with provisional route connections. Room `3-B202` is display-only because its entrance connection is unclear.
- SVG floor maps with room picking, keyboard selection, pan/zoom, room search and floor-by-floor route steps.
- Optional Three.js view generated from the same polygons, including atrium holes. The 3D bundle loads only when selected and pauses while hidden; the default SVG view works without WebGL.
- Shortest schematic route, stair avoidance, indoor preference and stairs preference. Stair avoidance does **not** certify wheelchair accessibility.
- Distances and walking times display “未測定” (not measured). Inferred connections can be excluded; no field-verified route network exists yet.

## Develop and check

Use Node.js 20 or newer and npm. Node.js is a development/build dependency, not a production application server.

```bash
git clone https://github.com/oz-coden/Uniview.git
cd Uniview
npm ci
npm run dev
```

```bash
npm run validate:data  # source references, IDs, connectivity and geometric checks
npm test               # regression tests and all-room-pair route optimality checks
npm run build          # validation, TypeScript and static build
npm run preview        # serve the built output locally
```

Deploy the contents of `dist/` to a static host such as GitHub Pages. Vite uses relative asset paths. The included deployment workflow requires GitHub Pages to be configured to use GitHub Actions; this change does not modify the repository’s hosting settings.

## Data maintenance

Data lives under `src/data/`, split into a campus manifest, overview, building records and per-floor JSON files. Shared compiler code transforms building-local geometry and navigation nodes into world coordinates for 3D rendering and route search. Files are discovered at build time; no database, API key or runtime backend is required.

See [Data authoring and verification](docs/data-authoring.md) for file paths, coordinate conventions, an editing example, provenance and remaining survey tasks. A graphical map editor and complete campus routing are future work.

## License

[MIT](LICENSE). Source photographs are not included; `src/data/sources.json` identifies the supplied reference images.

---

# 日本語

**Uniview** は、神奈川大学 横浜キャンパスの建物配置・フロア図と、参考経路を表示する静的Webアプリです。表示・検索・経路計算はブラウザー内で行います。

現在は、提供された校舎配置図と3号館の案内図を転記した**非公式の試作版**です。実寸・出入口・階段／EVの接続・利用制限などは現地未確認です。

## 登録範囲と操作

| 対象 | 現在の状態 |
| --- | --- |
| キャンパス全体 | 建物の概略配置。屋外経路は未登録 |
| 3号館 | B2・B1・1F・2F・3F・4Fの模式図 |
| 主要室 | 35室。うち34室に入口と通路の推定接続を登録 |
| 3-B202 | 入口の接続先が不明のため、表示のみ |
| 地下設備区画・ピット | 表示のみ。経路検索の対象外 |
| 実距離・徒歩時間 | 未測定 |

1. 上部の「キャンパス」「平面図」「3D」で表示を切り替えます。キャンパス図の3号館を選ぶとフロア図を開きます。
2. 右側の階ボタンで表示階を選びます。平面図はドラッグで移動、ホイールまたは＋／−で拡大縮小できます。
3. 出発地・目的地を入力し、検索候補を選びます。部屋をタップして「ここから出発」「ここへ行く」でも指定できます。
4. 道順カードを選ぶと、その階へ切り替わります。
5. 「未確認の接続を含む参考ルートを表示」を外すと、現地確認済みの接続だけで検索します。現状は接続未確認のため、別地点への経路は見つかりません。

「最短」は登録座標上の距離を最小化します。階段や屋外への隠れた加算はありません。ただし座標は模式図のため、実際の最短距離を保証するものではありません。「階段を避ける」は階段接続を除外する機能で、車椅子での通行可否を保証しません。

3Dは必要時に読み込みます。WebGLが利用できない環境でも平面図を利用できます。

## 開発・公開

Node.js 20以上とnpmで、上記のコマンドを実行してください。`npm run build` はデータ検証・型検査・静的ファイル生成を行い、`dist/` を出力します。公開後のアプリケーションサーバーやデータベースは不要です。

GitHub Pagesで公開する場合は、リポジトリの **Settings → Pages → Build and deployment → Source → GitHub Actions** を設定します。今回の変更では公開設定の変更・本番デプロイは行っていません。

## データの追加・修正

各階のJSONを編集すると、平面図・3D・経路検索に共通して反映されます。座標、出典、確認状態の扱いと具体例は [データ編集ガイド](docs/data-authoring.md) を参照してください。

次の段階では、現地との照合、入口・階段・EVの確認、実寸の校正、屋外経路・他棟の登録、図面を下敷きにした編集ツールを進める想定です。

## ライセンス

[MIT License](LICENSE)。写真原本は同梱せず、参照した写真を `src/data/sources.json` に記録しています。
