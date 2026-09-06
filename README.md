# Uniview

Japanese section is [available](#目次) below this section.

## Table of Contents

1. [Summary](#summary)
2. [Background of Development](#background-of-development)
3. [Features](#features)
4. [Usage](#usage)
5. [Data Architecture](#data-architecture)
6. [Requirements & Dependencies](#requirements--dependencies)
7. [Installation & Local Dev](#installation--local-dev)
8. [LICENSE](#license)
9. [CREDIT](#credit)

---

## Summary
**Uniview** is a serverless, client-side 3D campus navigation and route-finding system. Built entirely on coordinates and procedural geometry generation (without external 3D DCC models like Blender/GLTF), it dynamically constructs campus buildings, floor slabs, rooms, stairwells, and elevator shafts directly in the browser.

## Background of Development
Traditional 3D indoor navigation systems rely heavily on heavy 3D CAD/BIM or DCC models (GLTF/OBJ), making maintenance tedious whenever room assignments or layouts change. Uniview eliminates this burden through a **pure data-driven procedural architecture**, enabling instant updates via JSON/CSV and lightweight zero-latency deployment on static hosts like GitHub Pages or Cloudflare Pages.

## Features
- **Procedural 3D Architecture**: Generates buildings, rooms, stairs, and sky bridges dynamically from coordinate data.
- **Accordion / Exploded View**: Explode floors vertically or focus on a specific floor with real-time pin and path synchronization.
- **A\* Pathfinding Engine**: Calculates optimal routes across multi-floor buildings with customized constraints:
  - ⚡ **Shortest Path**
  - ♿ **Accessible (Barrier-Free)** (stairs excluded, elevator prioritized)
  - ☂️ **Rainy / Indoor Priority** (indoor sky-bridge prioritized)
  - 🪜 **Stairs Priority** (avoids elevator wait times)
- **High-Contrast Dark & Light Modes**: Seamless visual switching between clean architectural isometric and glowing neon cyber views.
- **Incremental Fuzzy Search**: Search classrooms, lecture halls, and facilities by name, aliases, or code.
- **Interactive 3D Picking**: Click directly on any room in 3D to inspect details and set Start or Destination points.
- **Step-by-Step Guidance**: Visual turn-by-turn cards with camera focus tracking.

## Usage
1. Open the web application.
2. Select or search an origin (e.g. "大学正門") and destination (e.g. "302情報ネットワーク講義室").
3. Choose routing condition (Shortest, Accessible, Indoor, Stairs).
4. Watch the animated 3D pulse route and click bottom guidance steps to inspect navigation turns.
5. Use the right panel to expand floors (e.g. focus on 3F).

## Data Architecture
Campus structures and navigation graphs are stored in `src/data/campus.json`. Customizing a university layout requires only editing JSON coordinates.

## Requirements & Dependencies
- Node.js >= 18.0.0
- Three.js
- @tweenjs/tween.js
- Vite & TypeScript

## Installation & Local Dev
```bash
# Clone repository
git clone https://github.com/oz-coden/Uniview.git
cd Uniview

# Install dependencies
npm install

# Start local dev server
npm run dev

# Build production static bundle
npm run build
```

## LICENSE
This project is released under the MIT License.  

## CREDIT
Developed with 💖 by Google Antigravity Advanced Agentic Coding.

---

# Uniview (日本語)

## 目次

1. [概要](#概要)
2. [開発背景](#開発背景)
3. [機能](#機能)
4. [使い方](#使い方)
5. [データ構造](#データ構造)
6. [前提・依存](#前提依存)
7. [導入・起動方法](#導入起動方法)
8. [ライセンス](#ライセンス)
9. [クレジット](#クレジット)

---

## 概要
**Uniview** は、Webブラウザ上で完結して大学構内の教室案内および任意の2点間ルート案内を提供する3Dキャンパスナビゲーションシステムです。
Blender等のDCCツールによる重い3Dモデリングデータを用いず、**座標データに基づくプロシージャル幾何生成**と**数学的A*探索グラフ**によって空間描画・垂直スライス展開・経路計算をすべてクライアントサイド（サーバーレス）で実行します。

## 開発背景
従来の3D屋内マップはCADやBlenderで制作した巨大な3Dモデル（GLTF等）を配信する必要があり、部屋の用途変更やフロア改修のたびにモデルを再編集・再書き出しする多大なコストがかかっていました。Univiewは**「完全データ駆動アプローチ」**を採用し、JSONで部屋の直方体バウンディングとノード接続を定義するだけで、即座に3Dキャンパス空間と高精度な経路探索網を自動構築します。

## 機能
- **プロシージャル3D幾何自動生成**:
  - 直方体（Box）の組み合わせで校舎・フロア・教室・階段シャフト・エレベーター・渡り廊下・中央広場・正門を自動生成。
  - 教室名や「🪜 階段」「🛗 EV」の3Dビルボードラベルを自動配置。
- **階層フォーカス型垂直エクスプロード（スライス展開）**:
  - 通常の全階展開スライダーに加え、指定した階（例: 3F）の上下の間隔が大きく開き、重なりを解消してその階が見渡せるアコーディオン展開を搭載。
  - **展開追従システム**: フロアがアニメーションで動いた際、出発地・目的地の3Dピンマーカーおよびルートスプライン曲線がリアルタイムに追従。
- **多条件A*経路探索エンジン**:
  - ⚡ **最短ルート**: 純粋な移動距離優先。
  - ♿ **バリアフリー**: 階段を完全除外、各棟のエレベーターや渡り廊下のみを利用。
  - ☂️ **雨天・屋内優先**: 屋外広場を避け、2F連絡スカイブリッジ（渡り廊下）を経由。
  - 🪜 **階段優先**: エレベーター待ち時間を回避し、階段ルートを優先。
- **ライト＆ダークモード両対応**:
  - ☀️ **ライトモード**: 清潔感のある建築アイソメトリック模型調（フロストガラス＆ソフトシャドウ）。
  - 🌙 **ダークモード**: サイバー調のダークスレート背景＋鮮烈なエレクトリック・シアン発光ルート＋ネオングリッド。
- **インクリメンタル検索 & 表記揺れ吸収**:
  - 教室名、号館番号（例: 「3-302」「3302」）、通称エイリアス（「学食」「図書館」「PC室」など）を即座にサジェスト。
- **3D直接タップ指定**:
  - 3D空間上の教室をクリックして詳細ツールチップを表示し、「ここから出発」「ここへ行く」を設定可能。
- **ステップ別道順テキストガイド**:
  - 「1. 正門から中央広場へ直進」→「2. 1号館エントランスから入館」→「3. 階段で3階へ上がる」といったカードを画面下部に提示。ステップをクリックするとカメラがその地点へスムーズにズーム＆パン移動。

## 使い方
1. ブラウザでアプリを開きます（`http://localhost:5173/`）。
2. 左パネルで出発地（例: 「大学正門」）と目的地（例: 「302情報ネットワーク講義室」）を選択または入力します。
3. 移動条件（「最短」「バリアフリー」「雨天・屋内」「階段優先」）を切り替えて最適なルートを確認します。
4. 右のフロアコントロールパネルで「3F」などをクリックすると、目的の階がアコーディオン展開されます。
5. 画面下部のステップカードをクリックすると、曲がり角や階段・EVの地点へカメラがフォーカスします。

## データ構造
キャンパスの幾何形状および接続関係は `src/data/campus.json` にすべて集約されています。
新しい教室や建物を追加・変更する際は、このJSONを編集するだけで即座に3D空間と経路探索に反映されます。

## 前提・依存
- Node.js >= 18.0.0
- Three.js
- @tweenjs/tween.js
- Vite & TypeScript

## 導入・起動方法
```bash
# リポジトリのクローン
git clone https://github.com/oz-coden/Uniview.git
cd Uniview

# 依存パッケージのインストール
npm install

# 開発サーバーの起動
npm run dev

# 本番用静的ファイルのビルド (dist/ が出力されます)
npm run build
```

## ライセンス
本プロジェクトは [MIT License](LICENSE) のもとで公開されています。

## クレジット
Developed with 💖 by Google Antigravity Advanced Agentic Coding.
