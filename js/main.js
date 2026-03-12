/* =========================================
   Gacha Main Controller
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    // E-001: characters.js 未読み込みチェック（インスタンス化前に実施）
    if (typeof CHARACTERS_R1 === 'undefined') {
        const msg = '⚠️ キャラクターデータの読み込みに失敗しました。ページを再読み込みしても解決しない場合は、管理者にお知らせください。';
        console.error('[E-001]', msg);
        _showFatalError(msg);
        return;
    }

    // E-002: config.js 未読み込みチェック（インスタンス化前に実施）
    if (typeof RATES === 'undefined') {
        const msg = '⚠️ 設定データの読み込みに失敗しました。ページを再読み込みしても解決しない場合は、管理者にお知らせください。';
        console.error('[E-002]', msg);
        _showFatalError(msg);
        return;
    }

    // インスタンス化
    window.gachaLogic = new GachaLogic();
    window.gachaView = new GachaView();

    // 初期化処理
    initialize();
});

// コントローラーの状態
let isSkipping = false;
let clickResolver = null;
let lastDrawCount = 1; // v0.08.1: リトライ用に記憶

// =========================================
// トリップメーター (F-050)
// =========================================

const TRIP_KEY = 'oriuma_gacha_trip_v1';

const tripMeter = {
    count: 0,

    load() {
        this.count = safeGetItem(TRIP_KEY, 0, 'トリップメーター');
        if (typeof this.count !== 'number' || !isFinite(this.count) || this.count < 0) {
            this.count = 0;
        }
    },

    save() {
        safeSetItem(TRIP_KEY, JSON.stringify(this.count));
    },

    increment(n) {
        this.count += n;
        this.save();
        this.render();
    },

    reset() {
        this.count = 0;
        this.save();
        this.render();
    },

    render() {
        const el = document.getElementById('trip-display');
        if (el) el.textContent = `🔄 Trip: ${this.count}回`;
    }
};

// =========================================
// 配信モード管理 (F-053)
// =========================================

const TEMP_KEY = 'oriuma_gacha_temp_v1';

const tempStatsManager = {
    data: null,

    _getNormalTargetIds() {
        return [
            ...CHARACTERS_R1.map(c => c.id),
            ...CHARACTERS_R2.map(c => c.id),
            ...CHARACTERS_R3.map(c => c.id)
        ];
    },

    _getFullTargetIds() {
        return [
            ...CHARACTERS_R1.map(c => c.id),
            ...CHARACTERS_R2.map(c => c.id),
            ...CHARACTERS_R3.map(c => c.id),
            ...CHARACTERS_R4.map(c => c.id)
        ];
    },

    _buildInitialData() {
        return {
            isActive: true,
            startedAt: new Date().toISOString(),
            totalDraws: 0,
            rarity: { pu: 0, r4: 0, r3: 0, r2: 0, r1: 0 },
            puDetails: {},
            characterCounts: {},
            completion: {
                normal: {
                    targetIds: this._getNormalTargetIds(),
                    obtainedIds: [],
                    isCompleted: false
                },
                full: {
                    targetIds: this._getFullTargetIds(),
                    obtainedIds: [],
                    isCompleted: false
                },
                completionCount: 0
            }
        };
    },

    load() {
        const saved = safeGetItem(TEMP_KEY, null, '配信統計');
        if (saved && saved.isActive === true) {
            this.data = saved;
            return true;
        }
        this.data = null;
        return false;
    },

    _save() {
        if (!this.data) return;
        safeSetItem(TEMP_KEY, JSON.stringify(this.data));
    },

    start() {
        this.data = this._buildInitialData();
        // E-302: 開始時書き込み失敗は専用メッセージで通知（safeSetItem を使わず直接書き込む）
        try {
            localStorage.setItem(TEMP_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.error('[E-302] 配信モード開始失敗', e);
            if (window.toastManager) {
                window.toastManager.show('📡 配信モードを開始できませんでした。ストレージ容量をご確認ください。');
            }
            this.data = null;
            return false;
        }
        this._renderUI(true);
        return true;
    },

    incrementDrawCount(n) {
        if (!this.data || !this.data.isActive) return;
        this.data.totalDraws += n;
        this._save();
        this._renderCount();
    },

    update(results) {
        if (!this.data || !this.data.isActive) return;

        results.forEach(res => {
            // レアリティ別カウント
            if (res.isPickup) {
                this.data.rarity.pu++;
                if (res.character && res.character.id) {
                    const id = res.character.id;
                    this.data.puDetails[id] = (this.data.puDetails[id] || 0) + 1;
                }
            } else if (res.realRarity === 4) {
                this.data.rarity.r4++;
            } else if (res.realRarity === 3) {
                this.data.rarity.r3++;
            } else if (res.realRarity === 2) {
                this.data.rarity.r2++;
            } else {
                this.data.rarity.r1++;
            }

            // キャラ別カウント
            if (res.character && res.character.id) {
                const id = res.character.id;
                this.data.characterCounts[id] = (this.data.characterCounts[id] || 0) + 1;
            }

            // Tempコンプリート進捗更新
            if (res.character && res.character.id) {
                const id = res.character.id;
                const comp = this.data.completion;

                if (!comp.normal.isCompleted &&
                    !comp.normal.obtainedIds.includes(id) &&
                    comp.normal.targetIds.includes(id)) {
                    comp.normal.obtainedIds.push(id);
                }
                if (!comp.full.isCompleted &&
                    !comp.full.obtainedIds.includes(id) &&
                    comp.full.targetIds.includes(id)) {
                    comp.full.obtainedIds.push(id);
                }
            }
        });

        this._checkTempCompletion();
        this._save(); // E-205: 失敗時は safeSetItem のトーストで通知
    },

    _checkTempCompletion() {
        const comp = this.data.completion;
        ['normal', 'full'].forEach(scope => {
            const prog = comp[scope];
            if (prog.isCompleted || prog.targetIds.length === 0) return;
            const allObtained = prog.targetIds.every(id => prog.obtainedIds.includes(id));
            if (allObtained) {
                prog.isCompleted = true;
                comp.completionCount++;
                // Tempコンプリート達成トースト（配信用）
                const label = scope === 'normal' ? 'Tempノーマルコンプリート' : 'Tempフルコンプリート';
                if (window.toastManager) {
                    window.toastManager.show(`🎉 📡 ${label}達成！ 配信${this.data.totalDraws.toLocaleString()}連`);
                }
            }
        });
    },

    _renderCount() {
        const countEl = document.getElementById('broadcast-count');
        if (countEl && this.data) {
            countEl.textContent = `${this.data.totalDraws}回`;
        }
    },

    _renderUI(isActive) {
        const offDiv = document.getElementById('broadcast-off');
        const onDiv = document.getElementById('broadcast-on');
        if (!offDiv || !onDiv) return;
        if (isActive) {
            offDiv.classList.add('hidden');
            onDiv.classList.remove('hidden');
            this._renderCount();
        } else {
            offDiv.classList.remove('hidden');
            onDiv.classList.add('hidden');
        }
    },

    renderUI() {
        this._renderUI(this.data !== null && this.data.isActive === true);
    }
};

function initialize() {
    // ISS-003: 統計データ強制リセット（CBT環境のデータ汚染解消）
    const RESET_FLAG_KEY = 'oriuma_gacha_reset_iss003';
    if (!localStorage.getItem(RESET_FLAG_KEY)) {
        localStorage.removeItem('oriuma_gacha_stats_v1');
        localStorage.setItem(RESET_FLAG_KEY, '1');
        console.log('[ISS-003] 統計データを強制リセットしました');
    }

    // インフォメーション表示
    if (typeof INFO_MESSAGE !== 'undefined') {
        window.gachaView.showInfo(INFO_MESSAGE);
    }

    // 統計情報の更新
    const stats = window.gachaLogic.getStats();
    window.gachaView.renderStats(stats);

    // E-104: R1確率異常の警告を stats-area に表示
    if (window.gachaLogic._rateError) {
        const statsArea = document.getElementById('stats-area');
        if (statsArea) {
            const warn = document.createElement('div');
            warn.className = 'stats-warning';
            warn.textContent = window.gachaLogic._rateError;
            statsArea.appendChild(warn);
        }
    }

    // トリップメーターの初期化
    tripMeter.load();
    tripMeter.render();

    // 配信モードの初期化・自動復帰 (F-053)
    tempStatsManager.load();
    tempStatsManager.renderUI();

    // コンプリートデータの初期化 (F-052)
    completionManager.load();
    completionManager.checkNewCharacters();

    // 配信モード復帰時はメイン統計のコンプリートトーストを抑制し、保留トーストを復元 (F-053)
    if (tempStatsManager.data && tempStatsManager.data.isActive) {
        completionManager.suppressToast = true;
        completionManager._loadPendingToasts();
    }

    // モーダル外側クリックイベント（履歴・統計・ヘルプ共通）
    window.onclick = function (event) {
        const historyModal = document.getElementById('history-modal');
        if (event.target == historyModal) {
            closeHistory();
        }
        const statsModal = document.getElementById('stats-modal');
        if (event.target == statsModal) {
            closeStats();
        }
        const helpModal = document.getElementById('help-modal');
        if (event.target == helpModal) {
            closeHelp();
        }
    }
}

/**
 * 致命的エラー時に display-area を差し替えてガチャ機能を無効化する
 * @param {string} message - エラーメッセージ
 */
function _showFatalError(message) {
    const displayArea = document.getElementById('display-area');
    if (displayArea) {
        displayArea.innerHTML = `<div class="fatal-error-message">${message}</div>`;
    }
    // ガチャボタンを無効化
    const btns = document.querySelectorAll('.gacha-btn, .action-btn');
    btns.forEach(btn => {
        btn.disabled = true;
    });
}

// =========================================
// 公開関数 (HTMLのonclickから呼ばれる)
// =========================================

async function pullGacha(count) {
    if (!window.gachaLogic || !window.gachaView) return;

    // v0.08.1: 回数記憶
    lastDrawCount = count;

    // UIリセット
    window.gachaView.resetForDraw();
    isSkipping = false;

    // リトライボタンのテキスト更新
    window.gachaView.updateRetryButton(count);

    // トリップメーターのカウント加算
    tripMeter.increment(count);

    // 配信カウンター加算 - トリップメーターと同タイミングで表示を更新 (F-053)
    if (tempStatsManager.data && tempStatsManager.data.isActive) {
        tempStatsManager.incrementDrawCount(count);
    }

    // 抽選実行
    const { results, gateText } = window.gachaLogic.draw(count);

    // 統計データ更新 (F-051)
    window.gachaLogic.updateStats(results);

    // ゲートテキスト表示
    window.gachaView.showGateText(gateText);

    // リスト枠作成
    window.gachaView.renderInitialList(results);

    // 演出開始
    await runPresentation(results);

    // 終了処理
    window.gachaView.finishGacha();

    // コンプリート進捗更新 (F-052) - 演出・結果ボタン表示後にトーストを出す
    completionManager.updateProgress(results);

    // Temp統計更新 (F-053) - 配信モードON中のみ並行記録
    if (tempStatsManager.data && tempStatsManager.data.isActive) {
        tempStatsManager.update(results);
    }

    // v0.08.1: シェアボタン制御は不要（静的配置のため）
}

function retryGacha() {
    pullGacha(lastDrawCount);
}

function backToTitle() {
    resetGacha();
}

function skipAnimation() {
    isSkipping = true;
    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
}

function resetGacha() {
    window.gachaView.resetUI();
    // hideShareButton(); // v0.08.1: 不要
}

// =========================================
// ヘルプモーダル (F-054)
// =========================================

function openHelp() {
    const modal = document.getElementById('help-modal');
    if (!modal) {
        console.error('[E-303] ヘルプモーダルのDOM要素が見つかりません');
        return;
    }
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeHelp() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

// 履歴関連
function openHistory() {
    const history = window.gachaLogic.getHistory();
    window.gachaView.renderHistory(history);
    document.body.classList.add('modal-open');
}

function closeHistory() {
    window.gachaView.closeHistory();
    document.body.classList.remove('modal-open');
}

function clearHistory() {
    if (confirm("履歴をすべて削除しますか？")) {
        window.gachaLogic.clearHistory();
        openHistory(); // 表示更新
    }
}

// =========================================
// 統計モーダル (F-051)
// =========================================

function openStats() {
    const stats = window.gachaLogic.getPlayStats();
    const modal = document.getElementById('stats-modal');
    const body = document.getElementById('stats-modal-body');
    const title = document.getElementById('stats-modal-title');
    if (!modal || !body) return;

    if (title) title.textContent = '📊 統計';
    body.innerHTML = _buildStatsHTML(stats);
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

// =========================================
// 配信モード 公開関数 (F-053)
// =========================================

function startBroadcast() {
    if (tempStatsManager.start()) {
        // 配信中はメイン統計のコンプリートトーストを抑制する (F-053)
        completionManager.suppressToast = true;
    }
}

function openTempStats() {
    if (!tempStatsManager.data) return;
    const modal = document.getElementById('stats-modal');
    const body = document.getElementById('stats-modal-body');
    const title = document.getElementById('stats-modal-title');
    if (!modal || !body) return;

    if (title) title.textContent = '📡 配信統計';
    body.innerHTML = _buildTempStatsHTML(tempStatsManager.data);
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function endBroadcast() {
    if (!tempStatsManager.data) return;
    if (!confirm('配信統計をクリアしますか？')) return;
    const d = tempStatsManager.data;
    const summary = `📡 配信統計: 合計${d.totalDraws}回 / PU:${d.rarity.pu} ★3:${d.rarity.r3} ★2:${d.rarity.r2} ★1:${d.rarity.r1} / コンプ:${d.completion.completionCount}回`;
    if (window.toastManager) {
        window.toastManager.show(summary, 8000);
    }
    try {
        localStorage.removeItem(TEMP_KEY);
    } catch (e) {
        console.error('[endBroadcast] LocalStorage削除失敗', e);
    }
    tempStatsManager.data = null;
    tempStatsManager._renderUI(false);

    // 配信中に保留していたメイン統計のコンプリート通知を即時表示 (F-053)
    completionManager.suppressToast = false;
    completionManager.flushPendingToasts();
}

function closeStats() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

/**
 * 統計モーダルのHTML文字列を生成する
 * @param {Object} stats - getPlayStats() の返値
 * @returns {string} HTML文字列
 */
function _buildStatsHTML(stats) {
    const total = stats.totalDraws || 0;

    // --- セクション1: 累計データ ---
    const firstPlay = stats.firstPlayDate || '---';
    const section1 = `
        <div class="stats-section">
            <h3 class="stats-section-title">累計データ</h3>
            <div class="stats-summary-grid">
                <div class="stats-summary-item">
                    <span class="stats-summary-label">総ガチャ回数</span>
                    <span class="stats-summary-value">${total.toLocaleString()}回</span>
                </div>
                <div class="stats-summary-item">
                    <span class="stats-summary-label">Trip</span>
                    <span class="stats-summary-value">${tripMeter.count.toLocaleString()}回</span>
                </div>
                <div class="stats-summary-item">
                    <span class="stats-summary-label">初回プレイ日</span>
                    <span class="stats-summary-value">${firstPlay}</span>
                </div>
            </div>
        </div>`;

    // --- セクション2: レアリティ別排出実績 ---
    // PU排出合計（puDrawsから算出）
    const puTotal = Object.values(stats.puDraws).reduce((a, b) => a + b, 0);
    const puRarityCount = stats.rarity.pu || 0;

    // 既存データ補正: 旧データではPU排出が★3にも加算されていた
    // 混入量 = puDraws合計 - rarity.pu（rarity.puが0の旧データでは全PU分が混入）
    const puContamination = Math.max(0, puTotal - puRarityCount);
    const correctedPuCount = puTotal; // PU排出の実数はpuDrawsが正
    const r3Count = Math.max(0, (stats.rarity.r3 || 0) - puContamination);
    const r2Count = stats.rarity.r2 || 0;
    const r1Count = stats.rarity.r1 || 0;
    const r4Count = stats.rarity.r4 || 0;

    // PU 1体あたり実績確率の計算
    const puCharCount = (stats.puConfig && stats.puConfig.length > 0)
        ? stats.puConfig.length
        : PICKUP_CHAR_IDS.length;
    const periodDraws = total - (stats.puPeriodStartDraws || 0);
    let puPerCharPct;
    if (periodDraws <= 0 || puCharCount === 0 || correctedPuCount === 0) {
        puPerCharPct = '0.00%/体';
    } else {
        puPerCharPct = ((correctedPuCount / puCharCount) / periodDraws * 100).toFixed(2) + '%/体';
    }

    const _pct = (count) => {
        if (total === 0) return '0.00%';
        return (count / total * 100).toFixed(2) + '%';
    };

    // PU未設定時（PICKUP_CHAR_IDSが空）はPU行を非表示
    const hasPU = PICKUP_CHAR_IDS.length > 0;
    const puRow = hasPU ? `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-pu">PU</span></td>
            <td data-label="回数">${correctedPuCount.toLocaleString()}回</td>
            <td data-label="実績確率">${puPerCharPct}</td>
            <td data-label="期待値">${PICKUP_RATE_PER_CHAR.toFixed(2)}%/体</td>
        </tr>` : '';
    const r3Row = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r3">★3</span></td>
            <td data-label="回数">${r3Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r3Count)}</td>
            <td data-label="期待値">${RATES.R3.toFixed(2)}%</td>
        </tr>`;
    const r2Row = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r2">★2</span></td>
            <td data-label="回数">${r2Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r2Count)}</td>
            <td data-label="期待値">${RATES.R2.toFixed(2)}%</td>
        </tr>`;
    const r1Row = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r1">★1</span></td>
            <td data-label="回数">${r1Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r1Count)}</td>
            <td data-label="期待値">残余</td>
        </tr>`;
    const r4Row = r4Count > 0 ? `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r4">★4</span></td>
            <td data-label="回数">${r4Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r4Count)}</td>
            <td data-label="期待値">???</td>
        </tr>` : '';

    // 注意書き（常時表示 + PU履歴がある場合の追記）
    const hasPuHistory = stats.puHistory && stats.puHistory.length > 0;
    let noteLines = ['※ 10連では★2以上確定枠があるため、10連のみを回している場合は★2の実績確率が期待値より高くなります。'];
    if (hasPuHistory) {
        noteLines.push('※ PU対象変更時、PUの回数はリセットされます（総ガチャ回数はリセットされません）。そのため表内の回数合計と総ガチャ回数が一致しない場合があります。過去のPU記録と合算すると一致します。');
    }
    const puNoteHTML = `
            <div class="stats-note">${noteLines.map(l => `<p>${l}</p>`).join('')}</div>`;

    const section2 = `
        <div class="stats-section">
            <h3 class="stats-section-title">レアリティ別排出実績</h3>${puNoteHTML}
            <div class="stats-table-wrapper">
                <table class="stats-rarity-table">
                    <thead>
                        <tr>
                            <th>★</th>
                            <th>回数</th>
                            <th>実績確率</th>
                            <th>期待値</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${puRow}${r3Row}${r2Row}${r1Row}${r4Row}
                    </tbody>
                </table>
            </div>
        </div>`;

    // --- セクション3: PU排出詳細 ---
    // 現在のPU期間: 各キャラ名・回数・個別実績確率
    let puCurrentHTML = '';
    const puEntries = Object.entries(stats.puDraws);
    if (!hasPU) {
        puCurrentHTML = '<p class="stats-empty-msg">現在はPU対象が設定されていません</p>';
    } else if (puEntries.length === 0) {
        puCurrentHTML = '<p class="stats-empty-msg">PU排出実績なし</p>';
    } else {
        puCurrentHTML = '<ul class="stats-pu-list">';
        puEntries.forEach(([id, count]) => {
            const char = window.gachaLogic._findCharacterById(id);
            const charPct = periodDraws > 0
                ? (count / periodDraws * 100).toFixed(2) + '%'
                : '0.00%';
            puCurrentHTML += `<li>${char.name}: ${count}回（${charPct}）</li>`;
        });
        puCurrentHTML += '</ul>';
    }

    // 過去PU記録（puHistory）の折りたたみ表示
    let puHistoryHTML = '';
    if (stats.puHistory && stats.puHistory.length > 0) {
        let historyContent = '';
        stats.puHistory.forEach((record, idx) => {
            const configNames = record.config.map(id => {
                const char = window.gachaLogic._findCharacterById(id);
                return char.name;
            });
            const recPeriodDraws = record.totalDrawsInPeriod || 0;
            const recPuCount = record.puRarityCount || 0;
            const recCharCount = record.config.length || 1;
            const recPerCharPct = recPeriodDraws > 0 && recCharCount > 0
                ? ((recPuCount / recCharCount) / recPeriodDraws * 100).toFixed(2) + '%/体'
                : '0.00%/体';

            let drawsDetail = '';
            const drawEntries = Object.entries(record.draws || {});
            if (drawEntries.length > 0) {
                drawsDetail = '<ul class="stats-pu-list">';
                drawEntries.forEach(([id, count]) => {
                    const char = window.gachaLogic._findCharacterById(id);
                    const charPct = recPeriodDraws > 0
                        ? (count / recPeriodDraws * 100).toFixed(2) + '%'
                        : '0.00%';
                    drawsDetail += `<li>${char.name}: ${count}回（${charPct}）</li>`;
                });
                drawsDetail += '</ul>';
            }

            historyContent += `
                <div class="stats-pu-history-item">
                    <p><strong>期間${idx + 1}:</strong> ${configNames.join('、')}</p>
                    <p>合計${recPuCount}回 / ${recPeriodDraws.toLocaleString()}連中 / ${recPerCharPct}</p>
                    ${drawsDetail}
                </div>`;
        });

        puHistoryHTML = `
            <details class="stats-pu-history">
                <summary>過去のPU記録（${stats.puHistory.length}期間）</summary>
                ${historyContent}
            </details>`;
    }

    const section3 = `
        <div class="stats-section">
            <h3 class="stats-section-title">PU排出（詳細）</h3>
            ${puCurrentHTML}
            ${puHistoryHTML}
        </div>`;

    // --- セクション4: 最頻出キャラ TOP3 / レアリティ別 ---
    const _getRarityFromId = (id) => {
        if (id.startsWith('4')) return 4;
        if (id.startsWith('3')) return 3;
        if (id.startsWith('2')) return 2;
        return 1;
    };

    // キャラIDをレアリティ別に分類して集計
    // ISS-003: ★3カウントからPU排出分を差し引く
    const byRarity = { 4: [], 3: [], 2: [], 1: [] };
    Object.entries(stats.characters).forEach(([id, count]) => {
        const r = _getRarityFromId(id);
        if (r === 3) {
            // 全PU排出回数 = 現行puDraws + 過去puHistory分
            let puTotal = (stats.puDraws && stats.puDraws[id]) ? stats.puDraws[id] : 0;
            if (stats.puHistory) {
                stats.puHistory.forEach(h => {
                    if (h.draws && h.draws[id]) puTotal += h.draws[id];
                });
            }
            const adjusted = count - puTotal;
            if (adjusted > 0) byRarity[3].push({ id, count: adjusted });
        } else {
            if (byRarity[r]) byRarity[r].push({ id, count });
        }
    });

    const _buildTop3 = (rarity) => {
        const list = byRarity[rarity];
        if (list.length === 0) return '';
        const sorted = list.sort((a, b) => b.count - a.count).slice(0, 3);
        const label = rarity === 4 ? '★4' : rarity === 3 ? '★3' : rarity === 2 ? '★2' : '★1';
        let html = `<div class="stats-top3-group"><span class="rarity-badge rarity-r${rarity}">${label}</span><ol class="stats-top3-list">`;
        sorted.forEach(item => {
            const char = window.gachaLogic._findCharacterById(item.id);
            html += `<li>${char.name} <span class="stats-top3-count">${item.count}回</span></li>`;
        });
        html += '</ol></div>';
        return html;
    };

    // ★4は実績がある場合のみ表示
    let top3HTML = _buildTop3(3) + _buildTop3(2) + _buildTop3(1);
    if (byRarity[4].length > 0) {
        top3HTML = _buildTop3(4) + top3HTML;
    }
    if (!top3HTML) top3HTML = '<p class="stats-empty-msg">排出実績なし</p>';

    const section4 = `
        <div class="stats-section">
            <h3 class="stats-section-title">最頻出キャラ（TOP3 / レアリティ別）</h3>
            <div class="stats-top3-container">
                ${top3HTML}
            </div>
        </div>`;

    // --- セクション5: コンプリートチャレンジ (F-052) ---
    const section5 = _buildCompletionSection();

    return section1 + section2 + section3 + section4 + section5;
}

/**
 * 統計モーダル セクション5（コンプリートチャレンジ）のHTML文字列を生成する
 * @returns {string} HTML文字列
 */
function _buildCompletionSection() {
    const compData = completionManager.getProgressData();
    if (!compData) {
        return `
        <div class="stats-section">
            <h3 class="stats-section-title">コンプリートチャレンジ</h3>
            <p class="stats-empty-msg">データを読み込めませんでした</p>
        </div>`;
    }

    const norm = compData.currentProgress.normalComplete;
    const full = compData.currentProgress.fullComplete;

    // ① 現在の進捗
    let normProgressHTML;
    if (norm.completedAt) {
        normProgressHTML = `<span class="complete-badge">✅ ノーマルコンプリート達成！</span>`;
    } else {
        normProgressHTML = `対象${norm.targetIds.length}キャラ中 ${norm.obtainedIds.length}体達成`;
    }

    let fullProgressHTML;
    if (full.completedAt) {
        fullProgressHTML = `<span class="complete-badge">✅ フルコンプリート達成！</span>`;
    } else {
        fullProgressHTML = `残りあと？体`;
    }

    // ② 達成記録一覧
    let recordsHTML;
    if (compData.records.length === 0) {
        recordsHTML = `<p class="stats-empty-msg">まだコンプリート達成はありません</p>`;
    } else {
        let rows = '';
        compData.records.forEach((rec, i) => {
            const typeLabel = rec.type === 'initial' ? '初期' : rec.type;
            let targetLabel = '';
            if (rec.type === 'initial' || rec.type === '全リセット') {
                const tc = rec.targetCount || {};
                const total = (tc.r1 || 0) + (tc.r2 || 0) + (tc.r3 || 0) + (tc.r4 || 0);
                const prefix = rec.type === 'initial' ? '初期' : '全';
                targetLabel = `${prefix}${total}名`;
            } else if (rec.type === '追加分') {
                const cnt = rec.newCharacterIds ? rec.newCharacterIds.length : '?';
                targetLabel = `+${cnt}名`;
            }
            const dt = _formatTimestamp(rec.timestamp);
            rows += `
                <tr>
                    <td data-label="#">#${i + 1}</td>
                    <td data-label="タイプ">${typeLabel}</td>
                    <td data-label="対象">${targetLabel}</td>
                    <td data-label="所要回数">${rec.totalDraws.toLocaleString()}連</td>
                    <td data-label="達成日時">${dt}</td>
                </tr>`;
        });
        recordsHTML = `
            <div class="stats-table-wrapper">
                <table class="stats-completion-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>タイプ</th>
                            <th>対象</th>
                            <th>所要回数</th>
                            <th>達成日時</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    return `
        <div class="stats-section">
            <h3 class="stats-section-title">コンプリートチャレンジ</h3>
            <div class="completion-progress-grid">
                <div class="completion-progress-item">
                    <span class="completion-progress-label">ノーマル</span>
                    <span class="completion-progress-value">${normProgressHTML}</span>
                </div>
                <div class="completion-progress-item">
                    <span class="completion-progress-label">フル</span>
                    <span class="completion-progress-value">${fullProgressHTML}</span>
                </div>
            </div>
            <p class="completion-records-subtitle">達成記録</p>
            ${recordsHTML}
        </div>`;
}

/**
 * Temp統計モーダルのHTML文字列を生成する (F-053)
 * @param {Object} tempData - tempStatsManager.data
 * @returns {string} HTML文字列
 */
function _buildTempStatsHTML(tempData) {
    const total = tempData.totalDraws || 0;
    const startedAt = _formatTimestamp(tempData.startedAt);

    // --- セクション1: 配信データサマリー ---
    const section1 = `
        <div class="stats-section">
            <h3 class="stats-section-title">配信データサマリー</h3>
            <div class="stats-summary-grid">
                <div class="stats-summary-item">
                    <span class="stats-summary-label">総ガチャ回数</span>
                    <span class="stats-summary-value">${total.toLocaleString()}回</span>
                </div>
                <div class="stats-summary-item">
                    <span class="stats-summary-label">配信開始</span>
                    <span class="stats-summary-value" style="font-size:13px;font-weight:normal">${startedAt}</span>
                </div>
            </div>
        </div>`;

    // --- セクション2: レアリティ別排出実績 ---
    const puCount = tempData.rarity.pu || 0;
    const r4Count = tempData.rarity.r4 || 0;
    const r3Count = tempData.rarity.r3 || 0;
    const r2Count = tempData.rarity.r2 || 0;
    const r1Count = tempData.rarity.r1 || 0;

    const _pct = (count) => {
        if (total === 0) return '0.00%';
        return (count / total * 100).toFixed(2) + '%';
    };

    const puRow = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-pu">PU</span></td>
            <td data-label="回数">${puCount.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(puCount)}</td>
        </tr>`;
    const r3Row = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r3">★3</span></td>
            <td data-label="回数">${r3Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r3Count)}</td>
        </tr>`;
    const r2Row = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r2">★2</span></td>
            <td data-label="回数">${r2Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r2Count)}</td>
        </tr>`;
    const r1Row = `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r1">★1</span></td>
            <td data-label="回数">${r1Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r1Count)}</td>
        </tr>`;
    const r4Row = r4Count > 0 ? `
        <tr>
            <td data-label="★"><span class="rarity-badge rarity-r4">★4</span></td>
            <td data-label="回数">${r4Count.toLocaleString()}回</td>
            <td data-label="実績確率">${_pct(r4Count)}</td>
        </tr>` : '';

    const section2 = `
        <div class="stats-section">
            <h3 class="stats-section-title">レアリティ別排出実績</h3>
            <div class="stats-table-wrapper">
                <table class="stats-rarity-table">
                    <thead>
                        <tr><th>★</th><th>回数</th><th>実績確率</th></tr>
                    </thead>
                    <tbody>
                        ${puRow}${r3Row}${r2Row}${r1Row}${r4Row}
                    </tbody>
                </table>
            </div>
        </div>`;

    // --- セクション3: PU排出詳細 ---
    let puDetailHTML = '';
    const puEntries = Object.entries(tempData.puDetails || {});
    if (puEntries.length === 0) {
        puDetailHTML = '<p class="stats-empty-msg">PU排出実績なし</p>';
    } else {
        puDetailHTML = '<ul class="stats-pu-list">';
        puEntries.forEach(([id, count]) => {
            const char = window.gachaLogic._findCharacterById(id);
            puDetailHTML += `<li>${char.name}: ${count}回</li>`;
        });
        puDetailHTML += '</ul>';
    }
    const section3 = `
        <div class="stats-section">
            <h3 class="stats-section-title">PU排出（詳細）</h3>
            ${puDetailHTML}
        </div>`;

    // --- セクション4: 最頻出キャラ TOP3 / レアリティ別 ---
    const _getRarityFromId = (id) => {
        if (id.startsWith('4')) return 4;
        if (id.startsWith('3')) return 3;
        if (id.startsWith('2')) return 2;
        return 1;
    };

    // ISS-003: ★3カウントからPU排出分を差し引く（配信モード統計）
    const byRarity = { 4: [], 3: [], 2: [], 1: [] };
    Object.entries(tempData.characterCounts || {}).forEach(([id, count]) => {
        const r = _getRarityFromId(id);
        if (r === 3) {
            const puCount = (tempData.puDetails && tempData.puDetails[id]) ? tempData.puDetails[id] : 0;
            const adjusted = count - puCount;
            if (adjusted > 0) byRarity[3].push({ id, count: adjusted });
        } else {
            if (byRarity[r]) byRarity[r].push({ id, count });
        }
    });

    const _buildTop3 = (rarity) => {
        const list = byRarity[rarity];
        if (list.length === 0) return '';
        const sorted = list.sort((a, b) => b.count - a.count).slice(0, 3);
        const label = rarity === 4 ? '★4' : rarity === 3 ? '★3' : rarity === 2 ? '★2' : '★1';
        let html = `<div class="stats-top3-group"><span class="rarity-badge rarity-r${rarity}">${label}</span><ol class="stats-top3-list">`;
        sorted.forEach(item => {
            const char = window.gachaLogic._findCharacterById(item.id);
            html += `<li>${char.name} <span class="stats-top3-count">${item.count}回</span></li>`;
        });
        html += '</ol></div>';
        return html;
    };

    let top3HTML = _buildTop3(3) + _buildTop3(2) + _buildTop3(1);
    if (byRarity[4].length > 0) top3HTML = _buildTop3(4) + top3HTML;
    if (!top3HTML) top3HTML = '<p class="stats-empty-msg">排出実績なし</p>';

    const section4 = `
        <div class="stats-section">
            <h3 class="stats-section-title">最頻出キャラ（TOP3 / レアリティ別）</h3>
            <div class="stats-top3-container">
                ${top3HTML}
            </div>
        </div>`;

    // --- セクション5: Tempコンプリート進捗 ---
    const comp = tempData.completion;
    const norm = comp.normal;
    const full = comp.full;

    const normProgress = norm.isCompleted
        ? `<span class="complete-badge">✅ 達成！</span>`
        : `${norm.targetIds.length}キャラ中 ${norm.obtainedIds.length}体`;
    const fullProgress = full.isCompleted
        ? `<span class="complete-badge">✅ 達成！</span>`
        : `残りあと？体`;

    const section5 = `
        <div class="stats-section">
            <h3 class="stats-section-title">Tempコンプリート進捗</h3>
            <div class="completion-progress-grid">
                <div class="completion-progress-item">
                    <span class="completion-progress-label">ノーマル</span>
                    <span class="completion-progress-value">${normProgress}</span>
                </div>
                <div class="completion-progress-item">
                    <span class="completion-progress-label">フル</span>
                    <span class="completion-progress-value">${fullProgress}</span>
                </div>
                <div class="completion-progress-item">
                    <span class="completion-progress-label">達成回数</span>
                    <span class="completion-progress-value">${comp.completionCount}回</span>
                </div>
            </div>
        </div>`;

    return section1 + section2 + section3 + section4 + section5;
}

/**
 * ISO 8601 形式のタイムスタンプをローカル時刻の表示文字列に変換する
 * @param {string} isoStr - ISO 8601 形式の文字列
 * @returns {string} `YYYY/MM/DD HH:mm` 形式
 */
function _formatTimestamp(isoStr) {
    try {
        const d = new Date(isoStr);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${y}/${mo}/${day} ${h}:${min}`;
    } catch (e) {
        return '---';
    }
}

// v0.07 画像生成
function generateImage() {
    window.gachaView.generateImage();
}

function resetTrip() {
    if (confirm('トリップカウンターをリセットしますか？')) {
        tripMeter.reset();
    }
}

// グローバルに公開
window.pullGacha = pullGacha;
window.resetTrip = resetTrip;
window.retryGacha = retryGacha; // New
window.backToTitle = backToTitle; // New
window.skipAnimation = skipAnimation;
window.resetGacha = resetGacha;
window.openHistory = openHistory;
window.closeHistory = closeHistory;
window.clearHistory = clearHistory;
window.openStats = openStats;
window.closeStats = closeStats;
window.generateImage = generateImage;
window.startBroadcast = startBroadcast;
window.openTempStats = openTempStats;
window.endBroadcast = endBroadcast;
window.openHelp = openHelp;
window.closeHelp = closeHelp;

// シェアボタン制御関数は廃止



// =========================================
// 演出進行ロジック
// =========================================

async function runPresentation(results) {
    // ゲートテキストを少し見せる時間
    // v0.08: GATE_OPEN設定値を使用
    const waitTime = (typeof ANIMATION_WAIT !== 'undefined') ? ANIMATION_WAIT.GATE_OPEN : 800;
    await sleep(isSkipping ? 0 : waitTime);

    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const rowId = i;

        // カーソル移動
        window.gachaView.highlightRow(rowId);

        // クリック待ち (スキップ中でなければ)
        if (!isSkipping) {
            await waitForClick();
        }

        // 行の開示（アニメーション含む）
        await revealRowSequence(res, rowId);
    }
}

async function revealRowSequence(res, rowId) {
    // v0.08: スキップ中断ロジック
    // スキップ中 かつ 中断フラグあり かつ 全スキップ設定OFF の場合
    const chkSkipAll = document.getElementById('chk-skip-all');
    const isSkipAll = chkSkipAll ? chkSkipAll.checked : false;

    if (isSkipping && res.shouldStopSkip && !isSkipAll) {
        isSkipping = false;
        // ここでfalseにすると、以降のsleepは通常ウェイトになる
    }

    // ウェイト設定
    const waits = (typeof ANIMATION_WAIT !== 'undefined') ? ANIMATION_WAIT : { PROMOTION_STEP: 600, QUOTE_DISPLAY: 1500 };

    // 昇格演出
    if (res.isPromotion) {
        if (res.promotionType === 'TO_4_FROM_3') {
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 4);
        }
        else if (res.promotionType === 'TO_4_FROM_2') {
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 3);
            await sleep(isSkipping ? 0 : waits.PROMOTION_STEP);
            window.gachaView.updateStar(rowId, 4);
        }
        else if (res.promotionType === 'C') { // 3 from 1
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 2);
            await sleep(isSkipping ? 0 : waits.PROMOTION_STEP);
            window.gachaView.updateStar(rowId, 3);
        }
        else if (res.promotionType === 'B') { // 3 from 2
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 3);
        }
        else if (res.promotionType === 'A') { // 2 from 1
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 2);
        }
    }

    // 名前とセリフの表示 (v0.08: 2段階表示)
    if (res.realRarity >= 3) {
        // Phase 1: セリフのみ (名前は？？？)
        await sleep(isSkipping ? 0 : 200);
        window.gachaView.updateRow(rowId, res, false);

        // セリフを読む時間
        await sleep(isSkipping ? 0 : waits.QUOTE_DISPLAY);

        // Phase 2: 名前表示
        window.gachaView.updateRow(rowId, res, true);
    } else {
        // 通常 (一括表示)
        await sleep(isSkipping ? 0 : 200);
        window.gachaView.updateRow(rowId, res, true);
    }
}

// =========================================
// Utility
// =========================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForClick() {
    return new Promise(resolve => { clickResolver = resolve; });
}

// 画面全体のクリックイベント（クリックで次へ）
document.addEventListener('click', (e) => {
    // ボタンのクリックは除外しないと、ボタンイベントと競合する可能性がある
    // ただし、ボタンonClickのあとにここに来る分には、clickResolverがあれば進むだけなので問題ない

    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
});

// =========================================
// キーボードショートカット (F-054)
// =========================================

document.addEventListener('keydown', (e) => {
    // input/textarea/select フォーカス中はショートカット無効
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // Ctrl/Meta/Alt 修飾キーとの組み合わせはブラウザ標準ショートカットを優先し無視
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // ヘルプモーダル表示中は Esc/H のみ受け付け、他は無視
    const helpModal = document.getElementById('help-modal');
    if (helpModal && !helpModal.classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'h' || e.key === 'H') {
            closeHelp();
        }
        return;
    }

    // 履歴・統計モーダル表示中はショートカット全て無視（誤作動防止）
    const historyModal = document.getElementById('history-modal');
    const statsModal = document.getElementById('stats-modal');
    if ((historyModal && !historyModal.classList.contains('hidden')) ||
        (statsModal && !statsModal.classList.contains('hidden'))) {
        return;
    }

    // H キー: ヘルプを開く（全画面状態共通）
    if (e.key === 'h' || e.key === 'H') {
        openHelp();
        return;
    }

    // 画面状態の判定（ctrl-* クラスの hidden で判断）
    const ctrlInit = document.getElementById('ctrl-init');
    const ctrlActive = document.getElementById('ctrl-active');
    const ctrlResult = document.getElementById('ctrl-result');

    const isInit = ctrlInit && !ctrlInit.classList.contains('hidden');
    const isActive = ctrlActive && !ctrlActive.classList.contains('hidden');
    const isResult = ctrlResult && !ctrlResult.classList.contains('hidden');

    if (isInit) {
        if (e.key === '1') {
            pullGacha(1);
        } else if (e.key === '0') {
            pullGacha(10);
        }
    } else if (isActive) {
        if (e.key === ' ') {
            e.preventDefault(); // Space によるページスクロールを抑制
            if (clickResolver) {
                const resolve = clickResolver;
                clickResolver = null;
                resolve();
            }
        } else if (e.key === 'Enter') {
            if (clickResolver) {
                const resolve = clickResolver;
                clickResolver = null;
                resolve();
            }
        } else if (e.key === 's' || e.key === 'S') {
            skipAnimation();
        }
    } else if (isResult) {
        if (e.key === ' ' || e.key === 'Enter') {
            retryGacha();
        } else if (e.key === '1') {
            pullGacha(1);
        } else if (e.key === '0') {
            pullGacha(10);
        } else if (e.key === 'p' || e.key === 'P') {
            generateImage();
        } else if (e.key === 'Escape') {
            backToTitle();
        }
    }
});
