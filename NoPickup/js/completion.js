/* =========================================
   コンプリート記録管理 (F-052)
   (依存: utils.js, characters.js)
   ========================================= */

const COMPLETION_KEY = 'oriuma_gacha_completion_v1';
const PENDING_TOASTS_KEY = 'oriuma_gacha_pending_toasts_v1';

const completionManager = {
    data: null,
    suppressToast: false,  // 配信モード中は true に設定してトーストを保留する (F-053)
    _pendingToasts: [],    // 保留中のコンプリートトーストメッセージ

    // =========================================
    // データ構築ヘルパー
    // =========================================

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

    _createInitialData() {
        return {
            version: 1,
            records: [],
            currentProgress: {
                normalComplete: {
                    targetIds: this._getNormalTargetIds(),
                    obtainedIds: [],
                    drawCount: 0,
                    mode: 'initial'
                },
                fullComplete: {
                    targetIds: this._getFullTargetIds(),
                    obtainedIds: [],
                    drawCount: 0,
                    mode: 'initial'
                }
            }
        };
    },

    // =========================================
    // ロード / セーブ
    // =========================================

    load() {
        const saved = safeGetItem(COMPLETION_KEY, null, 'コンプリート記録');
        if (!saved || saved.version !== 1) {
            this.data = this._createInitialData();
            this._save();
        } else {
            this.data = saved;
        }
    },

    _save() {
        safeSetItem(COMPLETION_KEY, JSON.stringify(this.data));
    },

    // =========================================
    // 進捗更新 (ガチャ結果反映)
    // =========================================

    updateProgress(results) {
        if (!this.data) return;
        const prog = this.data.currentProgress;
        const count = results.length;

        results.forEach(r => {
            if (!r.character || !r.character.id) return;
            const id = r.character.id;

            // ノーマル: targetIds に含まれ、かつ未取得のもの
            if (!prog.normalComplete.obtainedIds.includes(id) &&
                prog.normalComplete.targetIds.includes(id)) {
                prog.normalComplete.obtainedIds.push(id);
            }

            // フル: targetIds に含まれ、かつ未取得のもの
            if (!prog.fullComplete.obtainedIds.includes(id) &&
                prog.fullComplete.targetIds.includes(id)) {
                prog.fullComplete.obtainedIds.push(id);
            }
        });

        prog.normalComplete.drawCount += count;
        prog.fullComplete.drawCount += count;

        this._checkAndRecord('normalComplete');
        this._checkAndRecord('fullComplete');

        this._save();
    },

    // =========================================
    // コンプリート判定・記録
    // =========================================

    _checkAndRecord(scope) {
        const prog = this.data.currentProgress[scope];

        // 既に達成済みなら再判定しない
        if (prog.completedAt) return;
        if (prog.targetIds.length === 0) return;

        const allObtained = prog.targetIds.every(id => prog.obtainedIds.includes(id));
        if (!allObtained) return;

        // コンプリート達成
        const now = new Date().toISOString();
        const scopeStr = scope === 'normalComplete' ? 'normal' : 'full';
        const recordId = Date.now();

        const record = {
            id: recordId,
            type: prog.mode,
            timestamp: now,
            scope: scopeStr,
            totalDraws: prog.drawCount
        };

        // initial / 全リセット: targetCount を記録
        if (prog.mode === 'initial' || prog.mode === '全リセット') {
            const r1 = prog.targetIds.filter(id => id.startsWith('1')).length;
            const r2 = prog.targetIds.filter(id => id.startsWith('2')).length;
            const r3 = prog.targetIds.filter(id => id.startsWith('3')).length;
            const r4 = prog.targetIds.filter(id => id.startsWith('4')).length;
            record.targetCount = { r1, r2, r3 };
            if (r4 > 0) record.targetCount.r4 = r4;
        }

        // 追加分: parentId と newCharacterIds を記録
        if (prog.mode === '追加分') {
            record.parentId = prog.parentId || null;
            record.newCharacterIds = prog.newCharacterIds || [];
        }

        this.data.records.push(record);

        // 上限30件（古い順に削除）
        if (this.data.records.length > 30) {
            this.data.records = this.data.records.slice(this.data.records.length - 30);
        }

        // 達成済みマーク
        prog.completedAt = now;

        // トースト通知（配信モード中は保留）
        const label = scope === 'normalComplete' ? 'ノーマルコンプリート' : 'フルコンプリート';
        const toastMsg = `🎉 ${label}達成！ ${prog.drawCount.toLocaleString()}連`;
        if (this.suppressToast) {
            this._pendingToasts.push(toastMsg);
            // リロード後も復元できるよう LocalStorage に永続化 (F-053)
            safeSetItem(PENDING_TOASTS_KEY, JSON.stringify(this._pendingToasts));
        } else if (window.toastManager) {
            window.toastManager.show(toastMsg);
        }
    },

    // 保留中のトーストをすべて表示してバッファと LocalStorage を空にする (F-053)
    flushPendingToasts() {
        if (!window.toastManager || this._pendingToasts.length === 0) return;
        this._pendingToasts.forEach(msg => window.toastManager.show(msg));
        this._pendingToasts = [];
        try { localStorage.removeItem(PENDING_TOASTS_KEY); } catch (e) { /* noop */ }
    },

    // LocalStorage から保留トーストを復元する（リロード後の配信復帰時に呼ぶ）(F-053)
    _loadPendingToasts() {
        this._pendingToasts = safeGetItem(PENDING_TOASTS_KEY, [], '保留トースト');
    },

    // =========================================
    // 新キャラ追加検出 (E-301) - 起動時に呼ぶ
    // =========================================

    checkNewCharacters() {
        if (!this.data) return;
        this._checkNewCharsForScope('normalComplete', this._getNormalTargetIds());
        this._checkNewCharsForScope('fullComplete', this._getFullTargetIds());
    },

    _checkNewCharsForScope(scope, currentAllIds) {
        const prog = this.data.currentProgress[scope];

        // targetIds に存在しない ID が新キャラ
        const newIds = currentAllIds.filter(id => !prog.targetIds.includes(id));
        if (newIds.length === 0) return;

        const isCompleted = !!prog.completedAt;
        const scopeLabel = scope === 'normalComplete' ? 'ノーマル' : 'フル';

        if (isCompleted) {
            // 達成済み → A / B 選択の永続トースト
            if (window.toastManager) {
                window.toastManager.showPersistent(
                    `🆕 [${scopeLabel}] 新キャラクター${newIds.length}体が追加されました。チャレンジを続けますか？`,
                    [
                        {
                            label: 'A) 差分追跡',
                            onClick: () => this._applyDiffTracking(scope, newIds)
                        },
                        {
                            label: 'B) 全リセット',
                            onClick: () => this._applyFullReset(scope, currentAllIds)
                        }
                    ]
                );
            }
        } else {
            // 未達 → targetIds を自動更新して info バナーで通知
            prog.targetIds = currentAllIds;
            this._save();

            const msg = '🆕 新キャラクターが追加されました！コンプリートチャレンジを確認してください。';
            const infoArea = document.getElementById('info-area');
            if (infoArea) {
                if (!infoArea.classList.contains('hidden')) {
                    infoArea.innerHTML += '<br>' + msg;
                } else if (window.gachaView) {
                    window.gachaView.showInfo(msg);
                }
            }
        }
    },

    // A: 差分追跡 - 新キャラのみをターゲットに設定してリセット
    _applyDiffTracking(scope, newIds) {
        const prog = this.data.currentProgress[scope];
        const scopeStr = scope === 'normalComplete' ? 'normal' : 'full';

        // 親レコード: 同スコープの最新レコードID
        const parentRecord = [...this.data.records].reverse().find(r => r.scope === scopeStr);
        const parentId = parentRecord ? parentRecord.id : null;

        prog.targetIds = newIds;
        prog.obtainedIds = [];
        prog.drawCount = 0;
        prog.mode = '追加分';
        prog.parentId = parentId;
        prog.newCharacterIds = newIds;
        prog.completedAt = null;

        this._save();

        if (window.toastManager) {
            window.toastManager.show(`📋 差分追跡を開始しました（+${newIds.length}体）`);
        }
    },

    // B: 全リセット - 全キャラをゼロから追跡
    _applyFullReset(scope, allIds) {
        const prog = this.data.currentProgress[scope];

        prog.targetIds = allIds;
        prog.obtainedIds = [];
        prog.drawCount = 0;
        prog.mode = '全リセット';
        prog.completedAt = null;
        delete prog.parentId;
        delete prog.newCharacterIds;

        this._save();

        if (window.toastManager) {
            window.toastManager.show('🔄 全リセットを開始しました');
        }
    },

    // =========================================
    // UI データ取得
    // =========================================

    getProgressData() {
        return this.data;
    }
};
