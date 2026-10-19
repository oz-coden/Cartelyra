import { CampusData, RouteFilterType, RouteResult } from '../types/campus';

export interface SearchTarget {
  id: string;          // nodeId
  name: string;        // display name
  subText: string;     // building & floor info
  roomId?: string;     // optional room ID
  aliases: string[];
}

export class SearchPanel {
  private searchTargets: SearchTarget[] = [];
  public selectedStartNodeId: string | null = null;
  public selectedDestNodeId: string | null = null;
  public currentFilter: RouteFilterType = 'shortest';

  // DOM elements
  private inputStart = document.getElementById('input-start') as HTMLInputElement;
  private inputDest = document.getElementById('input-dest') as HTMLInputElement;
  private btnClearStart = document.getElementById('btn-clear-start') as HTMLElement;
  private btnClearDest = document.getElementById('btn-clear-dest') as HTMLElement;
  private btnPickStart = document.getElementById('btn-pick-start') as HTMLElement;
  private btnPickDest = document.getElementById('btn-pick-dest') as HTMLElement;
  private btnSwap = document.getElementById('btn-swap-points') as HTMLElement;
  private suggestionsStart = document.getElementById('suggestions-start') as HTMLElement;
  private suggestionsDest = document.getElementById('suggestions-dest') as HTMLElement;
  private summaryPanel = document.getElementById('route-summary-panel') as HTMLElement;
  private summaryDist = document.getElementById('summary-distance') as HTMLElement;
  private summaryTime = document.getElementById('summary-time') as HTMLElement;
  private summaryVertical = document.getElementById('summary-vertical') as HTMLElement;

  public onRouteClear: (() => void) | null = null;

  // Callbacks
  public onRouteSearch: ((startNodeId: string, destNodeId: string, filter: RouteFilterType, allowInferred: boolean) => void) | null = null;
  public onPickModeToggle: ((mode: 'start' | 'dest' | 'none') => void) | null = null;
  public onRoomFocus: ((roomId: string) => void) | null = null;

  constructor(private campusData: CampusData) {
    this.indexSearchTargets();
    this.renderPresets();
    this.setupEventListeners();
  }

  private indexSearchTargets() {
    this.searchTargets = [];

    // Index all rooms
    for (const bldg of this.campusData.buildings) {
      for (const floor of bldg.floors) {
        for (const room of floor.rooms) {
          if (!room.entranceNodeId) continue;
          this.searchTargets.push({
            id: room.entranceNodeId,
            name: room.name,
            subText: `${bldg.name} ${floor.label}`,
            roomId: room.id,
            aliases: [room.id, ...room.aliases]
          });
        }
      }
    }

    // Index preset navigation nodes
    for (const node of this.campusData.navigation.nodes) {
      if (node.isPreset && !this.searchTargets.some(t => t.id === node.id)) {
        this.searchTargets.push({
          id: node.id,
          name: node.name,
          subText: node.buildingId ? this.campusData.buildings.find(b => b.id === node.buildingId)?.floors.find(f => f.level === node.floor)?.label ?? '' : '屋外エリア',
          aliases: [node.name]
        });
      }
    }
  }

  private renderPresets() {
    const container = document.querySelector('.preset-chips')!; container.replaceChildren();
    const targets = this.searchTargets.filter(t => ['b3/f1/stair2', 'b3/f1/elevator', 'b3/f1/room-103', 'b3/f2/room-201'].includes(t.id));
    for (const target of targets) {
      const button = document.createElement('button'); button.className = 'preset-chip'; button.dataset.node = target.id;
      button.textContent = target.name; container.append(button);
    }
  }

  private clearRoute() { this.hideSummary(); this.onRouteClear?.(); }

  private setupEventListeners() {
    // Input start & suggestions
    this.inputStart.addEventListener('input', () => {
      this.selectedStartNodeId = null;
      this.clearRoute();
      this.handleSearchInput(this.inputStart.value, this.suggestionsStart, 'start');
      this.btnClearStart.classList.toggle('hidden', !this.inputStart.value);
    });

    this.inputDest.addEventListener('input', () => {
      this.selectedDestNodeId = null;
      this.clearRoute();
      this.handleSearchInput(this.inputDest.value, this.suggestionsDest, 'dest');
      this.btnClearDest.classList.toggle('hidden', !this.inputDest.value);
    });

    // Clear buttons
    this.btnClearStart.addEventListener('click', () => {
      this.inputStart.value = '';
      this.selectedStartNodeId = null;
      this.btnClearStart.classList.add('hidden');
      this.suggestionsStart.classList.add('hidden');
      this.checkAndTriggerSearch();
    });

    this.btnClearDest.addEventListener('click', () => {
      this.inputDest.value = '';
      this.selectedDestNodeId = null;
      this.btnClearDest.classList.add('hidden');
      this.suggestionsDest.classList.add('hidden');
      this.checkAndTriggerSearch();
    });

    // Pick 3D buttons
    this.btnPickStart.addEventListener('click', () => {
      const active = this.btnPickStart.classList.toggle('active');
      this.btnPickDest.classList.remove('active');
      if (this.onPickModeToggle) {
        this.onPickModeToggle(active ? 'start' : 'none');
      }
    });

    this.btnPickDest.addEventListener('click', () => {
      const active = this.btnPickDest.classList.toggle('active');
      this.btnPickStart.classList.remove('active');
      if (this.onPickModeToggle) {
        this.onPickModeToggle(active ? 'dest' : 'none');
      }
    });

    // Swap button
    this.btnSwap.addEventListener('click', () => {
      const tempText = this.inputStart.value;
      this.inputStart.value = this.inputDest.value;
      this.inputDest.value = tempText;

      const tempId = this.selectedStartNodeId;
      this.selectedStartNodeId = this.selectedDestNodeId;
      this.selectedDestNodeId = tempId;

      this.btnClearStart.classList.toggle('hidden', !this.inputStart.value);
      this.btnClearDest.classList.toggle('hidden', !this.inputDest.value);

      this.checkAndTriggerSearch();
    });

    // Preset chips
    const presetChips = document.querySelectorAll<HTMLButtonElement>('.preset-chip');
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const nodeId = chip.dataset.node;
        if (!nodeId) return;

        const target = this.searchTargets.find(t => t.id === nodeId);
        if (!target) return;

        // If start is empty, set start. Else set dest.
        if (!this.selectedStartNodeId) {
          this.setStart(target.id, target.name);
        } else {
          this.setDest(target.id, target.name);
        }
      });
    });

    document.getElementById('allow-inferred')?.addEventListener('change', () => this.checkAndTriggerSearch());

    // Filter toggle buttons
    const filterButtons = document.querySelectorAll<HTMLButtonElement>('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = (btn.dataset.filter as RouteFilterType) || 'shortest';
        this.checkAndTriggerSearch();
      });
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!this.inputStart.contains(target) && !this.suggestionsStart.contains(target)) {
        this.suggestionsStart.classList.add('hidden');
      }
      if (!this.inputDest.contains(target) && !this.suggestionsDest.contains(target)) {
        this.suggestionsDest.classList.add('hidden');
      }
    });

    // Toggle sidebar collapse
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar-panel');
    if (btnToggleSidebar && sidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        btnToggleSidebar.textContent = isCollapsed ? '開く' : '折りたたむ';
      });
    }
  }

  private handleSearchInput(query: string, container: HTMLElement, type: 'start' | 'dest') {
    const normalize = (value: string) => value.normalize('NFKC').replace(/[−–—]/g, '-').trim().toLowerCase();
    const q = normalize(query);
    if (!q) {
      container.classList.add('hidden');
      return;
    }

    // Filter matches
    const matches = this.searchTargets.filter(target => {
      if (normalize(target.name).includes(q)) return true;
      if (normalize(target.subText).includes(q)) return true;
      return target.aliases.some(a => normalize(a).includes(q));
    }).slice(0, 6);

    container.innerHTML = '';
    if (matches.length === 0) {
      container.innerHTML = '<div class="suggestion-item"><span class="suggestion-name">該当する場所が見つかりません</span></div>';
    } else {
      for (const item of matches) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'suggestion-item';
        const name = document.createElement('span'), sub = document.createElement('span');
        name.className = 'suggestion-name'; name.textContent = item.name;
        sub.className = 'suggestion-sub'; sub.textContent = item.subText; row.append(name, sub);
        row.addEventListener('click', () => {
          if (type === 'start') {
            this.setStart(item.id, item.name);
          } else {
            this.setDest(item.id, item.name);
          }
          if (item.roomId && this.onRoomFocus) {
            this.onRoomFocus(item.roomId);
          }
          container.classList.add('hidden');
        });
        container.appendChild(row);
      }
    }
    container.classList.remove('hidden');
  }

  public setStart(nodeId: string, displayName: string) {
    this.selectedStartNodeId = nodeId;
    this.inputStart.value = displayName;
    this.btnClearStart.classList.remove('hidden');
    this.btnPickStart.classList.remove('active');
    this.checkAndTriggerSearch();
  }

  public setDest(nodeId: string, displayName: string) {
    this.selectedDestNodeId = nodeId;
    this.inputDest.value = displayName;
    this.btnClearDest.classList.remove('hidden');
    this.btnPickDest.classList.remove('active');
    this.checkAndTriggerSearch();
  }

  public checkAndTriggerSearch() {
    if (this.selectedStartNodeId && this.selectedDestNodeId) {
      if (this.onRouteSearch) {
        this.onRouteSearch(this.selectedStartNodeId, this.selectedDestNodeId, this.currentFilter, (document.getElementById('allow-inferred') as HTMLInputElement).checked);
      }
    } else {
      this.clearRoute();
    }
  }

  public updateSummary(result: RouteResult) {
    this.summaryDist.textContent = result.distanceUnit === 'meters' ? `${result.totalDistance} m` : '未測定';
    this.summaryTime.textContent = result.distanceUnit === 'meters' ? `約 ${result.estimatedMinutes} 分` : '未測定';
    this.summaryVertical.textContent = result.floorChanges === 0 ? '同フロア' : `${result.floorChanges} フロア移動`;
    document.getElementById('route-confidence')!.textContent = result.pathNodes.length === 1 ? '出発地と目的地は同じ場所です' : result.inferredConnections ? '参考ルート（現地未確認の接続を含みます）' : '現地確認済みの接続';
    this.summaryPanel.classList.remove('hidden');
  }

  public hideSummary() {
    this.summaryPanel.classList.add('hidden');
  }
}
