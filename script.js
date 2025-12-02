/* =========================================
   オリウマ ガチャシミュレーター 制御ロジック
   (v0.03 - ★4シークレット昇格 & レイアウト修正対応版)
   ========================================= */

// グローバル変数
let isSkipping = false; // スキップモード中かどうか
let clickResolver = null; // クリック待ちのPromise解決用関数

// HTML要素の取得
const elResultList = document.getElementById('result-list');
const elGateText = document.getElementById('gate-text-area');
const elBtnSingle = document.getElementById('btn-single');
const elBtnMulti = document.getElementById('btn-multi');
const elBtnSkip = document.getElementById('btn-skip');
const elBtnReset = document.getElementById('btn-reset');

// =========================================
// 1. ガチャを引く（メインエントリー）
// =========================================
async function pullGacha(count) {
    setupUIForStart();
    
    // 抽選データの生成
    const results = generateResults(count);

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
// 2. 抽選ロジック
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
    if (rarity === 4) list = CHARACTERS_R4;
    else if (rarity === 3) list = CHARACTERS_R3;
    else if (rarity === 2) list = CHARACTERS_R2;
    else list = CHARACTERS_R1;

    if (!list || list.length === 0) {
        return { id: "000", name: "データなし", quote: "" };
    }
    const index = Math.floor(Math.random() * list.length);
    return list[index];
}

// 昇格演出の判定（ロジック強化）
function checkPromotion(realRarity) {
    const rand = Math.floor(Math.random() * 100) + 1;

    // ★4の場合: 必ず昇格演出を経由する（★1からは開始しない）
    if (realRarity === 4) {
        // PROMOTION_CHATES.R4_START_FROM_R3 の確率で ★3 からスタート
        // 残りは ★2 からスタート（★1からはスタートさせない）
        if (rand <= PROMOTION_CHATES.R4_START_FROM_R3) {
            return { isPromotion: true, initialRarity: 3, type: 'TO_4_FROM_3' };
        } else {
            // ★2からスタートし、3を経由して4になる（2段階昇格）
            return { isPromotion: true, initialRarity: 2, type: 'TO_4_FROM_2' };
        }
    }

    // ★3の場合
    if (realRarity === 3) {
        if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG) {
            return { isPromotion: true, initialRarity: 1, type: 'C' }; // 1->2->3
        }
        if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG + PROMOTION_CHATES.HIDE_R3_WEAK) {
            return { isPromotion: true, initialRarity: 2, type: 'B' }; // 2->3
        }
    }

    // ★2の場合
    if (realRarity === 2) {
        if (rand <= PROMOTION_CHATES.HIDE_R2) {
            return { isPromotion: true, initialRarity: 1, type: 'A' }; // 1->2
        }
    }

    // 昇格なし
    return { isPromotion: false, initialRarity: realRarity, type: null };
}

// ゲートテキストの決定（サプライズ確率対応）
function decideGateText(results, count) {
    if (count === 1) return GATE_TEXTS.LOW;

    const hasStar4 = results.some(r => r.realRarity === 4);
    const hasStar3 = results.some(r => r.realRarity === 3);
    const star2Count = results.filter(r => r.realRarity === 2).length;
    
    const rand = Math.random(); // 0.0 〜 1.0

    // 1. ★4が含まれる場合
    if (hasStar4) {
        const s = GATE_TEXT_SETTINGS.WITH_R4;
        if (rand < s.HIGH) return GATE_TEXTS.HIGH; // Eclipse
        if (rand < s.HIGH + s.MIDDLE) return GATE_TEXTS.MIDDLE; // Favorite (サプライズ)
        return GATE_TEXTS.LOW; // Long Shot (大逆転)
    }

    // 2. ★3が含まれる場合
    if (hasStar3) {
        const s = GATE_TEXT_SETTINGS.WITH_R3;
        if (rand < s.HIGH) return GATE_TEXTS.HIGH;
        if (rand < s.HIGH + s.MIDDLE) return GATE_TEXTS.MIDDLE;
        return GATE_TEXTS.LOW; // Long Shot (逆転)
    }

    // 3. ★2が2枚以上の場合
    if (star2Count >= 2) {
        const s = GATE_TEXT_SETTINGS.WITH_MANY_R2;
        if (rand < s.MIDDLE) return GATE_TEXTS.MIDDLE;
        return GATE_TEXTS.LOW;
    }

    return GATE_TEXTS.LOW;
}

// =========================================
// 3. 演出ロジック
// =========================================

function renderInitialList(results) {
    results.forEach((res, index) => {
        const li = document.createElement('li');
        li.id = `result-row-${index}`;
        
        // マーカー
        const marker = document.createElement('span');
        marker.className = 'cursor-marker';
        marker.textContent = '▶';
        marker.style.visibility = 'hidden';
        li.appendChild(marker);

        // 星
        const starSpan = document.createElement('span');
        starSpan.className = `star-text rarity-${res.displayRarity}`;
        starSpan.textContent = getStarString(res.displayRarity);
        starSpan.id = `star-${index}`;
        li.appendChild(starSpan);

        // 名前
        const nameSpan = document.createElement('span');
        nameSpan.className = 'char-name';
        nameSpan.textContent = '？？？';
        nameSpan.id = `name-${index}`;
        li.appendChild(nameSpan);

        // セリフ（CSSで改行される）
        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'char-quote';
        quoteDiv.id = `quote-${index}`;
        li.appendChild(quoteDiv);

        elResultList.appendChild(li);
    });
}

function getStarString(rarity) {
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
        // --- ★4への昇格演出 ---
        if (res.promotionType === 'TO_4_FROM_3') {
            // ★3 -> ★4
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(4);
            elStar.className = `star-text rarity-4`;
        }
        else if (res.promotionType === 'TO_4_FROM_2') {
            // ★2 -> ★3 -> ★4 (2段階)
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
            
            await sleep(isSkipping ? 0 : 600); // 溜める
            elStar.textContent = getStarString(4);
            elStar.className = `star-text rarity-4`;
        }
        // --- ★3への昇格演出 ---
        else if (res.promotionType === 'C') { // 1->2->3
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(2);
            elStar.className = `star-text rarity-2`;
            
            await sleep(isSkipping ? 0 : 600);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
        }
        else if (res.promotionType === 'B') { // 2->3
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
        }
        // --- ★2への昇格演出 ---
        else if (res.promotionType === 'A') { // 1->2
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(2);
            elStar.className = `star-text rarity-2`;
        }
    }

    // B. 名前表示
    await sleep(isSkipping ? 0 : 200);
    elName.textContent = res.character.name;
    
    // ★3以上なら強調＆セリフ
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