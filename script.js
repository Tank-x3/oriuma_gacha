/* =========================================
   オリウマ ガチャシミュレーター 制御ロジック
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
    // UI初期化
    setupUIForStart();
    
    // 抽選データの生成（バックグラウンド処理）
    const results = generateResults(count);

    // ゲートテキストの決定と表示
    const gateText = decideGateText(results, count);
    elGateText.textContent = gateText;
    elGateText.classList.remove('hidden');

    // リスト枠の作成（初期状態：星のみ表示）
    renderInitialList(results);

    // 順次演出の開始
    await runPresentation(results);

    // 完了後の処理
    finishGacha();
}

// UIを開始状態にする
function setupUIForStart() {
    isSkipping = false;
    elResultList.innerHTML = ''; // リストクリア
    elGateText.classList.add('hidden');
    
    // ボタン制御
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
        
        // 10連の最後（10回目）だけ確定枠の確率を使用
        if (count === 10 && i === 9) {
            currentRates = GUARANTEED_RATES;
        }

        // A. レアリティ決定
        const rarity = pickRarity(currentRates);

        // B. キャラクター決定
        const character = pickCharacter(rarity);

        // C. 昇格判定（初期表示レアリティの決定）
        const promotion = checkPromotion(rarity);

        results.push({
            realRarity: rarity,          // 真のレア度
            displayRarity: promotion.initialRarity, // 初期表示レア度
            character: character,        // キャラクターデータ
            isPromotion: promotion.isPromotion,     // 昇格するかどうか
            promotionType: promotion.type           // 昇格タイプ (A, B, C)
        });
    }
    return results;
}

// 確率に基づいてレア度を抽選
function pickRarity(rates) {
    const rand = Math.floor(Math.random() * 100) + 1; // 1〜100
    if (rand <= rates.R3) return 3;
    if (rand <= rates.R3 + rates.R2) return 2;
    return 1;
}

// レア度に基づいてキャラクターをリストからランダム選出
function pickCharacter(rarity) {
    let list = [];
    if (rarity === 3) list = CHARACTERS_R3;
    else if (rarity === 2) list = CHARACTERS_R2;
    else list = CHARACTERS_R1;

    // リストが空の場合のエラーハンドリング
    if (list.length === 0) {
        return { id: "000", name: "データなし", quote: "" };
    }

    const index = Math.floor(Math.random() * list.length);
    return list[index];
}

// 昇格演出の判定
function checkPromotion(realRarity) {
    const rand = Math.floor(Math.random() * 100) + 1;

    // パターンC: ★3なのに★1からスタート（2段階昇格）
    if (realRarity === 3 && rand <= PROMOTION_CHATES.HIDE_R3_STRONG) {
        return { isPromotion: true, initialRarity: 1, type: 'C' };
    }
    // パターンB: ★3なのに★2からスタート
    if (realRarity === 3 && rand <= PROMOTION_CHATES.HIDE_R3_STRONG + PROMOTION_CHATES.HIDE_R3_WEAK) {
        return { isPromotion: true, initialRarity: 2, type: 'B' };
    }
    // パターンA: ★2なのに★1からスタート
    if (realRarity === 2 && rand <= PROMOTION_CHATES.HIDE_R2) {
        return { isPromotion: true, initialRarity: 1, type: 'A' };
    }

    // 昇格なし（そのまま表示）
    return { isPromotion: false, initialRarity: realRarity, type: null };
}

// ゲートテキストの決定
function decideGateText(results, count) {
    // 1回ガチャの場合は常に汎用（または調整）
    if (count === 1) return GATE_TEXTS.LOW;

    const hasStar3 = results.some(r => r.realRarity === 3);
    const star2Count = results.filter(r => r.realRarity === 2).length;

    // Eclipse判定 (★3あり、かつ50%の確率)
    if (hasStar3 && Math.random() < 0.5) {
        return GATE_TEXTS.HIGH;
    }

    // Favorite判定 (★3あり、または★2が2枚以上)
    if (hasStar3 || star2Count >= 2) {
        return GATE_TEXTS.MIDDLE;
    }

    // Long Shot (それ以外)
    return GATE_TEXTS.LOW;
}

// =========================================
// 3. 演出ロジック
// =========================================

// 初期リスト（星だけ）の描画
function renderInitialList(results) {
    results.forEach((res, index) => {
        const li = document.createElement('li');
        li.id = `result-row-${index}`;
        
        // マーカー（初期は不可視）
        const marker = document.createElement('span');
        marker.className = 'cursor-marker';
        marker.textContent = '▶';
        marker.style.visibility = 'hidden';
        li.appendChild(marker);

        // 星表示
        const starSpan = document.createElement('span');
        starSpan.className = `star-text rarity-${res.displayRarity}`; // 色クラス適用
        starSpan.textContent = getStarString(res.displayRarity);
        starSpan.id = `star-${index}`;
        li.appendChild(starSpan);

        // 名前（初期は？？？）
        const nameSpan = document.createElement('span');
        nameSpan.className = 'char-name';
        nameSpan.textContent = '？？？';
        nameSpan.id = `name-${index}`;
        li.appendChild(nameSpan);

        // セリフ格納用（まだ空）
        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'char-quote';
        quoteDiv.id = `quote-${index}`;
        li.appendChild(quoteDiv);

        elResultList.appendChild(li);
    });
}

// 星の文字列表現
function getStarString(rarity) {
    return '★'.repeat(rarity);
}

// メイン演出ループ
async function runPresentation(results) {
    // 最初のゲートテキスト表示ウェイト
    await sleep(isSkipping ? 0 : 800);

    // 初期リストをパラパラ表示（不透明度などで演出もできるが、今回は一斉表示済みとして扱う）
    // ここでは1行目から順に処理を開始

    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const rowId = i;

        // カーソル移動
        updateCursor(rowId);

        // クリック待ち（またはスキップ）
        if (!isSkipping) {
            await waitForClick();
        }

        // 昇格・確定演出
        await revealRow(res, rowId);
    }
}

// 1行分の開示演出
async function revealRow(res, rowId) {
    const elStar = document.getElementById(`star-${rowId}`);
    const elName = document.getElementById(`name-${rowId}`);
    const elQuote = document.getElementById(`quote-${rowId}`);

    // A. 昇格演出
    if (res.isPromotion) {
        // パターンA (1->2) または C (1->2->3) の第一段階
        if (res.promotionType === 'A' || res.promotionType === 'C') {
            await sleep(isSkipping ? 0 : 300); // タメ
            elStar.textContent = getStarString(2);
            elStar.className = `star-text rarity-2`;
            // パターンCの場合、さらに次へ
            if (res.promotionType === 'C') {
                 await sleep(isSkipping ? 0 : 600); // 2段目のタメ
                 elStar.textContent = getStarString(3);
                 elStar.className = `star-text rarity-3`;
            }
        }
        // パターンB (2->3)
        else if (res.promotionType === 'B') {
            await sleep(isSkipping ? 0 : 300);
            elStar.textContent = getStarString(3);
            elStar.className = `star-text rarity-3`;
        }
    }

    // B. 名前表示
    await sleep(isSkipping ? 0 : 200);
    elName.textContent = res.character.name;
    
    // ★3なら強調
    if (res.realRarity === 3) {
        elName.classList.add('rarity-3');
        // セリフがあり、かつ空でない場合
        if (res.character.quote && res.character.quote !== "") {
            elQuote.textContent = res.character.quote;
        }
    }
}

// =========================================
// 4. ユーティリティ・制御関数
// =========================================

// カーソル位置の更新
function updateCursor(activeIndex) {
    // 全行のマーカーを隠す
    const allMarkers = document.querySelectorAll('.cursor-marker');
    allMarkers.forEach(m => {
        m.style.visibility = 'hidden';
        m.classList.remove('blinking');
    });

    // 現在行のマーカーを表示・点滅
    const activeRow = document.getElementById(`result-row-${activeIndex}`);
    if (activeRow) {
        const marker = activeRow.querySelector('.cursor-marker');
        marker.style.visibility = 'visible';
        marker.classList.add('blinking');
        
        // 自動スクロール（スマホ対策）
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// クリック待機（Promise作成）
function waitForClick() {
    return new Promise(resolve => {
        clickResolver = resolve;
    });
}

// 画面全体のクリックイベント（待機解除用）
document.addEventListener('click', () => {
    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve(); // 待機を解除して次へ
    }
});

// スキップボタン
function skipAnimation() {
    isSkipping = true;
    // 現在待機中のPromiseがあれば強制解除
    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
}

// ガチャ完了処理
function finishGacha() {
    // カーソル消去
    const allMarkers = document.querySelectorAll('.cursor-marker');
    allMarkers.forEach(m => {
        m.style.visibility = 'hidden';
        m.classList.remove('blinking');
    });

    // ボタン切り替え
    elBtnSkip.classList.add('hidden');
    elBtnReset.classList.remove('hidden');
    elBtnSingle.classList.remove('hidden'); // 次回用に表示
    elBtnMulti.classList.remove('hidden');
}

// リセット（再ロードせずに画面を戻す）
function resetGacha() {
    elResultList.innerHTML = '<li class="placeholder-text">「ガチャを引く」ボタンを押してください</li>';
    elGateText.classList.add('hidden');
    elGateText.textContent = '';
    
    elBtnReset.classList.add('hidden');
    elBtnSingle.classList.remove('hidden');
    elBtnMulti.classList.remove('hidden');
}

// 指定ミリ秒待機
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}