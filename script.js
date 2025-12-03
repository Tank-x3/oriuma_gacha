/* =========================================
   オリウマ ガチャシミュレーター 制御ロジック
   (v0.05 - 実装数表示 & 履歴機能対応版)
   ========================================= */

// グローバル変数
let isSkipping = false;
let clickResolver = null;
const HISTORY_KEY = 'oriuma_gacha_history_v1'; // LocalStorageのキー

// HTML要素の取得
const elResultList = document.getElementById('result-list');
const elGateText = document.getElementById('gate-text-area');
const elInfoArea = document.getElementById('info-area');
const elStatsArea = document.getElementById('stats-area'); // 新規
const elHistoryModal = document.getElementById('history-modal'); // 新規
const elHistoryList = document.getElementById('history-list'); // 新規

const elBtnSingle = document.getElementById('btn-single');
const elBtnMulti = document.getElementById('btn-multi');
const elBtnSkip = document.getElementById('btn-skip');
const elBtnReset = document.getElementById('btn-reset');

// =========================================
// 0. 初期化処理 (ページ読み込み時)
// =========================================
window.addEventListener('DOMContentLoaded', () => {
    // 1. インフォメーション表示
    if (typeof INFO_MESSAGE !== 'undefined' && INFO_MESSAGE !== "") {
        elInfoArea.innerHTML = INFO_MESSAGE;
        elInfoArea.classList.remove('hidden');
    } else {
        elInfoArea.classList.add('hidden');
    }

    // 2. 実装数・確率情報の更新
    updateStatsDisplay();
});

// =========================================
// 1. ガチャを引く
// =========================================
async function pullGacha(count) {
    setupUIForStart();
    
    // 抽選データの生成
    const results = generateResults(count);

    // 履歴に保存
    saveHistory(results);

    // ゲートテキストの決定と表示
    const gateText = decideGateText(results, count);
    elGateText.textContent = gateText;
    elGateText.classList.remove('hidden');

    // リスト枠の作成
    renderInitialList(results);

    // 順次演出の開始
    await runPresentation(results);

    finishGacha();
}

function setupUIForStart() {
    isSkipping = false;
    elResultList.innerHTML = '';
    elGateText.classList.add('hidden');
    elBtnSingle.classList.add('hidden');
    elBtnMulti.classList.add('hidden');
    elBtnSkip.classList.remove('hidden');
    elBtnReset.classList.add('hidden');
}

// =========================================
// 2. 情報表示 & 履歴管理 (新規実装)
// =========================================

// 提供割合・実装数の表示
function updateStatsDisplay() {
    // ★4は秘密にするため計算しない
    const stats = [
        { label: "★3 (SSR)", rate: RATES.R3, list: CHARACTERS_R3 },
        { label: "★2 (SR)",  rate: RATES.R2, list: CHARACTERS_R2 },
        { label: "★1 (R)",   rate: RATES.R1, list: CHARACTERS_R1 }
    ];

    let html = "";
    stats.forEach(s => {
        const count = s.list ? s.list.length : 0;
        let individualRate = "---";
        
        // 個別確率 = 全体確率 / 実装数
        if (count > 0) {
            // 小数点第3位まで表示 (例: 1.234%)
            individualRate = (s.rate / count).toFixed(4) + "%";
        }

        html += `
            <div class="stats-row">
                <span class="stats-label">${s.label}</span>
                <span class="stats-value">実装: ${count}名 / 個別確率: ${individualRate}</span>
            </div>
        `;
    });

    elStatsArea.innerHTML = html;
}

// 履歴の保存
function saveHistory(results) {
    // 既存の履歴を取得
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    
    // 新しい結果を追加
    const now = new Date();
    const timeStr = `${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    results.forEach(res => {
        history.unshift({
            date: timeStr,
            name: res.character.name,
            rarity: res.realRarity,
            isPromotion: res.isPromotion // 昇格したかどうかも記録可能
        });
    });

    // 最新100件に制限
    if (history.length > 100) {
        history = history.slice(0, 100);
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// 履歴モダルの操作
function openHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    elHistoryList.innerHTML = "";

    if (history.length === 0) {
        elHistoryList.innerHTML = "<div style='padding:10px; text-align:center;'>履歴はありません</div>";
    } else {
        history.forEach(h => {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            // レア度ごとの色付け
            let rarityClass = `rarity-${h.rarity}`;
            let starStr = "★".repeat(h.rarity);
            if(h.rarity === 999) { starStr="GOD"; rarityClass="rarity-4"; } // GOD対応

            div.innerHTML = `
                <span class="history-date">${h.date}</span>
                <span class="history-name">
                    <span class="${rarityClass}" style="margin-right:5px;">${starStr}</span>
                    ${h.name}
                </span>
            `;
            elHistoryList.appendChild(div);
        });
    }

    elHistoryModal.classList.remove('hidden');
}

function closeHistory() {
    elHistoryModal.classList.add('hidden');
}

function clearHistory() {
    if(confirm("履歴をすべて削除しますか？")) {
        localStorage.removeItem(HISTORY_KEY);
        openHistory(); // 表示更新
    }
}

// モダル外クリックで閉じる
window.onclick = function(event) {
    if (event.target == elHistoryModal) {
        closeHistory();
    }
}


// =========================================
// 3. 抽選ロジック
// =========================================
function generateResults(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        let currentRates = RATES;
        if (count === 10 && i === 9) {
            currentRates = GUARANTEED_RATES;
        }

        const rarity = pickRarity(currentRates);
        const character = pickCharacter(rarity);
        const promotion = checkPromotion(rarity);

        results.push({
            realRarity: rarity,
            displayRarity: promotion.initialRarity,
            character: character,
            isPromotion: promotion.isPromotion,
            promotionType: promotion.type
        });
    }
    return results;
}

function pickRarity(rates) {
    const rand = Math.random() * 100;
    let threshold = 0;

    if (rates.GOD) {
        threshold += rates.GOD;
        if (rand < threshold) return 999; 
    }
    if (rates.R4) {
        threshold += rates.R4;
        if (rand < threshold) return 4;
    }
    threshold += rates.R3;
    if (rand < threshold) return 3;
    threshold += rates.R2;
    if (rand < threshold) return 2;
    return 1;
}

function pickCharacter(rarity) {
    let list = [];
    if (rarity === 999) return { name: "GOD PACK", quote: "GOD PACK!!" }; 
    else if (rarity === 4) list = CHARACTERS_R4;
    else if (rarity === 3) list = CHARACTERS_R3;
    else if (rarity === 2) list = CHARACTERS_R2;
    else list = CHARACTERS_R1;

    if (!list || list.length === 0) {
        return { id: "000", name: "データなし", quote: "" };
    }
    const index = Math.floor(Math.random() * list.length);
    return list[index];
}

function checkPromotion(realRarity) {
    const rand = Math.floor(Math.random() * 100) + 1;

    if (realRarity === 4) {
        if (rand <= PROMOTION_CHATES.R4_START_FROM_R3) {
            return { isPromotion: true, initialRarity: 3, type: 'TO_4_FROM_3' };
        } else {
            return { isPromotion: true, initialRarity: 2, type: 'TO_4_FROM_2' };
        }
    }
    if (realRarity === 3) {
        if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG) {
            return { isPromotion: true, initialRarity: 1, type: 'C' }; 
        }
        if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG + PROMOTION_CHATES.HIDE_R3_WEAK) {
            return { isPromotion: true, initialRarity: 2, type: 'B' }; 
        }
    }
    if (realRarity === 2) {
        if (rand <= PROMOTION_CHATES.HIDE_R2) {
            return { isPromotion: true, initialRarity: 1, type: 'A' }; 
        }
    }
    return { isPromotion: false, initialRarity: realRarity, type: null };
}

function decideGateText(results, count) {
    if (count === 1) return GATE_TEXTS.LOW;

    const hasStar4 = results.some(r => r.realRarity === 4);
    const hasStar3 = results.some(r => r.realRarity === 3);
    const star2Count = results.filter(r => r.realRarity === 2).length;
    
    const rand = Math.random();

    if (hasStar4) {
        const s = GATE_TEXT_SETTINGS.WITH_R4;
        if (rand < s.HIGH) return GATE_TEXTS.HIGH;
        if (rand < s.HIGH + s.MIDDLE) return GATE_TEXTS.MIDDLE; 
        return GATE_TEXTS.LOW; 
    }
    if (hasStar3) {
        const s = GATE_TEXT_SETTINGS.WITH_R3;
        if (rand < s.HIGH) return GATE_TEXTS.HIGH;
        if (rand < s.HIGH + s.MIDDLE) return GATE_TEXTS.MIDDLE;
        return GATE_TEXTS.LOW; 
    }
    if (star2Count >= 2) {
        const s = GATE_TEXT_SETTINGS.WITH_MANY_R2;
        if (rand < s.MIDDLE) return GATE_TEXTS.MIDDLE;
        return GATE_TEXTS.LOW;
    }
    return GATE_TEXTS.LOW;
}

// =========================================
// 4. 演出ロジック
// =========================================

function renderInitialList(results) {
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
        starSpan.textContent = getStarString(res.displayRarity);
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

        elResultList.appendChild(li);
    });
}

function getStarString(rarity) {
    if (rarity === 999) return "★GOD★";
    return '★'.repeat(rarity);
}

async function runPresentation(results) {
    await sleep(isSkipping ? 0 : 800);

    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const rowId = i;

        updateCursor(rowId);

        if (!isSkipping) {
            await waitForClick();
        }

        await revealRow(res, rowId);
    }
}

async function revealRow(res, rowId) {
    const elStar = document.getElementById(`star-${rowId}`);
    const elName = document.getElementById(`name-${rowId}`);
    const elQuote = document.getElementById(`quote-${rowId}`);

    // A. 昇格演出
    if (res.isPromotion) {
        if (res.promotionType === 'TO_4_FROM_3') {
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(4);
            elStar.className = `star-text rarity-4`;
        }
        else if (res.promotionType === 'TO_4_FROM_2') {
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
            await sleep(isSkipping ? 0 : 600); 
            elStar.textContent = getStarString(4);
            elStar.className = `star-text rarity-4`;
        }
        else if (res.promotionType === 'C') { 
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(2);
            elStar.className = `star-text rarity-2`;
            await sleep(isSkipping ? 0 : 600);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
        }
        else if (res.promotionType === 'B') { 
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
        }
        else if (res.promotionType === 'A') { 
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(2);
            elStar.className = `star-text rarity-2`;
        }
    }

    // B. 名前表示
    await sleep(isSkipping ? 0 : 200);
    elName.textContent = res.character.name;
    
    // ★3以上なら強調
    if (res.realRarity >= 3) {
        elName.classList.add(`rarity-${res.realRarity}`);
        if (res.character.quote && res.character.quote !== "") {
            elQuote.textContent = res.character.quote;
        }
    }
}

// =========================================
// 4. ユーティリティ
// =========================================
function updateCursor(activeIndex) {
    const allMarkers = document.querySelectorAll('.cursor-marker');
    allMarkers.forEach(m => {
        m.style.visibility = 'hidden';
        m.classList.remove('blinking');
    });

    const activeRow = document.getElementById(`result-row-${activeIndex}`);
    if (activeRow) {
        const marker = activeRow.querySelector('.cursor-marker');
        marker.style.visibility = 'visible';
        marker.classList.add('blinking');
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function waitForClick() {
    return new Promise(resolve => { clickResolver = resolve; });
}

document.addEventListener('click', () => {
    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
});

function skipAnimation() {
    isSkipping = true;
    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
}

function finishGacha() {
    const allMarkers = document.querySelectorAll('.cursor-marker');
    allMarkers.forEach(m => {
        m.style.visibility = 'hidden';
        m.classList.remove('blinking');
    });
    elBtnSkip.classList.add('hidden');
    elBtnReset.classList.remove('hidden');
    elBtnSingle.classList.remove('hidden');
    elBtnMulti.classList.remove('hidden');
}

function resetGacha() {
    elResultList.innerHTML = '<li class="placeholder-text">「ガチャを引く」ボタンを押してください</li>';
    elGateText.classList.add('hidden');
    elGateText.textContent = '';
    elBtnReset.classList.add('hidden');
    elBtnSingle.classList.remove('hidden');
    elBtnMulti.classList.remove('hidden');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}