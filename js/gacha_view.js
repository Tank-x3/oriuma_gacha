/* =========================================
   Gacha View Module
   ========================================= */

/**
 * 画面表示(DOM)を制御するクラス
 */
class GachaView {
    constructor() {
        this.elResultList = document.getElementById('result-list');
        this.elGateText = document.getElementById('gate-text-area');
        this.elInfoArea = document.getElementById('info-area');
        this.elStatsArea = document.getElementById('stats-area');
        this.elHistoryModal = document.getElementById('history-modal');
        this.elHistoryList = document.getElementById('history-list');

        this.elBtnSingle = document.getElementById('btn-single');
        this.elBtnMulti = document.getElementById('btn-multi');
        this.elBtnSkip = document.getElementById('btn-skip');
        this.elBtnReset = document.getElementById('btn-reset');
    }

    /**
     * インフォメーションを表示
     * @param {string} message 
     */
    showInfo(message) {
        if (message && message !== "") {
            this.elInfoArea.innerHTML = message;
            this.elInfoArea.classList.remove('hidden');
        } else {
            this.elInfoArea.classList.add('hidden');
        }
    }

    /**
     * 提供割合情報を表示
     * @param {Array} stats 
     */
    renderStats(stats) {
        let html = "";
        stats.forEach(s => {
            const count = s.list ? s.list.length : 0;
            let individualRate = "---";
            if (count > 0) {
                individualRate = (s.rate / count).toFixed(4) + "%";
            }
            html += `
                <div class="stats-row">
                    <span class="stats-label">${s.label}</span>
                    <span class="stats-value">実装: ${count}名 / 個別確率: ${individualRate}</span>
                </div>
            `;
        });
        this.elStatsArea.innerHTML = html;
    }

    /**
     * 抽選結果エリアを初期化（ガチャ開始時）
     */
    resetForDraw() {
        this.elResultList.innerHTML = '';
        this.elGateText.classList.add('hidden');
        this.elBtnSingle.classList.add('hidden');
        this.elBtnMulti.classList.add('hidden');
        this.elBtnSkip.classList.remove('hidden');
        this.elBtnReset.classList.add('hidden');
    }

    /**
     * ゲートテキストを表示
     * @param {string} text 
     */
    showGateText(text) {
        this.elGateText.textContent = text;
        this.elGateText.classList.remove('hidden');
    }

    /**
     * 結果リストの枠を作成（内容はまだ？？？）
     * @param {Array} results 
     */
    renderInitialList(results) {
        results.forEach((res, index) => {
            const li = document.createElement('li');
            li.id = `result-row-${index}`;

            const marker = document.createElement('span');
            marker.className = 'cursor-marker';
            marker.textContent = '▶';
            marker.style.visibility = 'hidden';
            li.appendChild(marker);

            const starSpan = document.createElement('span');
            starSpan.className = `star-text rarity-${res.displayRarity}`;
            starSpan.textContent = this._getStarString(res.displayRarity);
            starSpan.id = `star-${index}`;
            li.appendChild(starSpan);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'char-name';
            nameSpan.textContent = '？？？';
            nameSpan.id = `name-${index}`;
            li.appendChild(nameSpan);

            const quoteDiv = document.createElement('div');
            quoteDiv.className = 'char-quote';
            quoteDiv.id = `quote-${index}`;
            li.appendChild(quoteDiv);

            this.elResultList.appendChild(li);
        });
    }

    /**
     * 結果を1行確定表示する
     * @param {number} index 
     * @param {Object} res 
     */
    updateRow(index, res) {
        const elName = document.getElementById(`name-${index}`);
        const elQuote = document.getElementById(`quote-${index}`);

        elName.textContent = res.character.name;

        if (res.realRarity >= 3) {
            elName.classList.add(`rarity-${res.realRarity}`);
            if (res.character.quote && res.character.quote !== "") {
                elQuote.textContent = res.character.quote;
            }
        }
    }

    /**
     * カーソル位置を更新する
     * @param {number} index 
     */
    highlightRow(index) {
        const allMarkers = document.querySelectorAll('.cursor-marker');
        allMarkers.forEach(m => {
            m.style.visibility = 'hidden';
            m.classList.remove('blinking');
        });

        const activeRow = document.getElementById(`result-row-${index}`);
        if (activeRow) {
            const marker = activeRow.querySelector('.cursor-marker');
            marker.style.visibility = 'visible';
            marker.classList.add('blinking');
            activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * 昇格演出用：星の表示を更新する
     * @param {number} index 
     * @param {number} rarity 
     */
    updateStar(index, rarity) {
        const elStar = document.getElementById(`star-${index}`);
        elStar.textContent = this._getStarString(rarity);
        elStar.className = `star-text rarity-${rarity}`;
    }

    /**
     * ガチャ終了時のUI状態にする
     */
    finishGacha() {
        const allMarkers = document.querySelectorAll('.cursor-marker');
        allMarkers.forEach(m => {
            m.style.visibility = 'hidden';
            m.classList.remove('blinking');
        });
        this.elBtnSkip.classList.add('hidden');
        this.elBtnReset.classList.remove('hidden');
        this.elBtnSingle.classList.remove('hidden');
        this.elBtnMulti.classList.remove('hidden');
    }

    /**
     * リセット時のUI状態
     */
    resetUI() {
        this.elResultList.innerHTML = '<li class="placeholder-text">「ガチャを引く」ボタンを押してください</li>';
        this.elGateText.classList.add('hidden');
        this.elGateText.textContent = '';
        this.elBtnReset.classList.add('hidden');
        this.elBtnSingle.classList.remove('hidden');
        this.elBtnMulti.classList.remove('hidden');
    }

    /**
     * 履歴リストを表示
     * @param {Array} history 
     */
    renderHistory(history) {
        this.elHistoryList.innerHTML = "";
        if (history.length === 0) {
            this.elHistoryList.innerHTML = "<div style='padding:10px; text-align:center;'>履歴はありません</div>";
        } else {
            history.forEach(h => {
                const div = document.createElement('div');
                div.className = 'history-item';

                let rarityClass = `rarity-${h.rarity}`;
                let starStr = "★".repeat(h.rarity);
                if (h.rarity === 999) { starStr = "GOD"; rarityClass = "rarity-4"; }

                div.innerHTML = `
                    <span class="history-date">${h.date}</span>
                    <span class="history-name">
                        <span class="${rarityClass}" style="margin-right:5px;">${starStr}</span>
                        ${h.name}
                    </span>
                `;
                this.elHistoryList.appendChild(div);
            });
        }
        this.elHistoryModal.classList.remove('hidden');
    }

    closeHistory() {
        this.elHistoryModal.classList.add('hidden');
    }

    _getStarString(rarity) {
        if (rarity === 999) return "★GOD★";
        return '★'.repeat(rarity);
    }
}
