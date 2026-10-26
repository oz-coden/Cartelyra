# 共通UIの取り込み

配色・フォント・ボタン・フォーカス表示・ヘッダーの基礎スタイルは、[oz-coden.com-ui-web](https://github.com/oz-coden/oz-coden.com-ui-web) のCSSを利用する。利用するコミットとSHA-256は `shared-ui.json`、未改変のCSSとMITライセンスは `public/vendor/ui/` に保存する。公開時には同じファイルが `dist/vendor/ui/` に含まれる。

`index.html` で共通CSSを読み込み、`src/style.css` でアプリ固有のレイアウトを定義する。`--surface` などの既存変数は共通の `--c-*` トークンを参照する。操作ボタンには、動的に生成するものも含めて `.ui-button` を指定する。

地図内の部屋・WC・EV・階段・参考ルート・選択位置の色、地図操作、PCのサイドバー、スマートフォンのルート編集パネルはCartelyra側で管理する。地図で使うSVGの文字サイズと、スマートフォンの44px以上の操作領域も維持する。

共通のJavaScriptは読み込まない。`ThemeManager` が保存済みのCartelyraのテーマと旧設定の移行を扱い、`html[data-theme]` を更新して共通CSSへ反映する。同じ処理で地図固有の配色と立体図も更新するため、テーマを管理する処理は重複しない。

## 更新手順

通常の開発・ビルドでは同梱済みのファイルを使用する。`npm run build` はビルド前にチェックサムを検証し、共通UIへの外部通信は行わない。

共通UIを更新するときは、利用したいコミットの40桁のSHAを指定する。次のコマンドだけが上流からCSSとライセンスを取得する。

```sh
npm run sync:ui -- <40-character-commit-sha>
npm test
npm run build
```

ライト・ダーク両テーマで、PC・スマートフォンの地図・検索・道順・ルート編集・立体図を確認する。`shared-ui.json` と `public/vendor/ui/` をまとめてコミットする。共通CSSは直接編集せず、Cartelyra固有の調整は `src/style.css` で行う。
