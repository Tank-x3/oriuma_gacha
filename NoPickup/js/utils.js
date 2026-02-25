/* =========================================
   共通ユーティリティ
   v0.11: トースト通知 + LocalStorage安全操作
   ========================================= */

// =========================================
// ToastManager: トースト通知コンポーネント
// =========================================

class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
        // DOMContentLoaded前に呼ばれる可能性があるため遅延取得
    }

    _getContainer() {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
        }
        return this.container;
    }

    /**
     * 通常トーストを表示（一定時間後に自動消去）
     * @param {string} message - 表示メッセージ
     * @param {number} [duration=4000] - 表示時間(ms)
     */
    show(message, duration = 4000) {
        const el = this._createToastEl(message, false, []);
        this._mount(el);
        setTimeout(() => this._remove(el), duration);
    }

    /**
     * 永続トーストを表示（手動で閉じるまで消えない）
     * @param {string} message - 表示メッセージ
     * @param {Array<{label: string, onClick: Function}>} [buttons=[]] - 操作ボタン定義
     */
    showPersistent(message, buttons = []) {
        const el = this._createToastEl(message, true, buttons);
        this._mount(el);
    }

    /**
     * トーストDOM要素を生成
     * @private
     */
    _createToastEl(message, persistent, buttons) {
        const el = document.createElement('div');
        el.className = persistent ? 'toast toast-persistent' : 'toast';

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toast-message';
        msgSpan.textContent = message;
        el.appendChild(msgSpan);

        // 操作ボタン（永続トースト用）
        if (buttons.length > 0) {
            const btnArea = document.createElement('div');
            btnArea.className = 'toast-btn-area';
            buttons.forEach(btn => {
                const b = document.createElement('button');
                b.className = 'toast-action-btn';
                b.textContent = btn.label;
                b.addEventListener('click', () => {
                    if (btn.onClick) btn.onClick();
                    this._remove(el);
                });
                btnArea.appendChild(b);
            });
            el.appendChild(btnArea);
        }

        // 閉じるボタン（常に付与）
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close-btn';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', '閉じる');
        closeBtn.addEventListener('click', () => this._remove(el));
        el.appendChild(closeBtn);

        return el;
    }

    /**
     * コンテナにトーストを追加
     * @private
     */
    _mount(el) {
        const container = this._getContainer();
        if (!container) {
            console.error('[ToastManager] #toast-container が見つかりません');
            return;
        }
        container.appendChild(el);
        // 表示アニメーション
        requestAnimationFrame(() => el.classList.add('toast-visible'));
    }

    /**
     * トーストを削除
     * @private
     */
    _remove(el) {
        if (!el || !el.parentNode) return;
        el.classList.remove('toast-visible');
        el.classList.add('toast-hiding');
        el.addEventListener('transitionend', () => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, { once: true });
        // transitionが発火しない場合のフォールバック
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 600);
    }
}

// グローバルインスタンス（DOMContentLoaded後に初期化）
window.toastManager = null;
document.addEventListener('DOMContentLoaded', () => {
    window.toastManager = new ToastManager();
});


// =========================================
// LocalStorage 共通ユーティリティ
// =========================================

/**
 * localStorage.setItem を安全に実行する
 * QuotaExceededError 時はトースト通知（永続・操作ボタン付き）
 * @param {string} key - ストレージキー
 * @param {string} value - 保存する値（JSON文字列）
 * @returns {boolean} 成功時 true、失敗時 false
 */
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.error(`[E-201/E-20x] localStorage.setItem 失敗 key="${key}"`, e);

        const manager = window.toastManager;
        if (manager) {
            manager.showPersistent(
                '💾 データの保存に失敗しました。ブラウザのストレージが不足しています。不要な履歴データを削除してお試しください。',
                [
                    {
                        label: '履歴を削除',
                        onClick: () => {
                            try {
                                localStorage.removeItem('oriuma_gacha_history_v1');
                            } catch (removeErr) {
                                console.error('[safeSetItem] 履歴削除失敗', removeErr);
                            }
                        }
                    }
                ]
            );
        }
        return false;
    }
}

/**
 * localStorage.getItem + JSON.parse を安全に実行する
 * データ破損時はトースト通知 + 自動初期化（該当キーを削除）
 * @param {string} key - ストレージキー
 * @param {*} defaultValue - 失敗時に返すデフォルト値
 * @param {string} [displayName] - エラーメッセージに表示するキー名（省略時はkeyをそのまま使用）
 * @returns {*} パース済みの値、またはdefaultValue
 */
function safeGetItem(key, defaultValue, displayName) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return defaultValue;
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[E-202/E-207] localStorage 読み込み失敗 key="${key}"`, e);

        // 自動初期化（破損データを削除）
        try {
            localStorage.removeItem(key);
        } catch (removeErr) {
            console.error('[safeGetItem] 自動初期化の削除失敗', removeErr);
        }

        const name = displayName || key;
        const manager = window.toastManager;
        if (manager) {
            manager.show(`💾 保存データの読み込みに失敗しました。データを初期化します。（${name}）`);
        }

        return defaultValue;
    }
}
