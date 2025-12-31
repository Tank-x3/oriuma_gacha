/* =========================================
   Gacha Main Controller
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    // インスタンス化
    window.gachaLogic = new GachaLogic();
    window.gachaView = new GachaView();

    // イベントリスナー設定
    // イベントリスナー設定 (setupEventListenersは未定義のため削除) 
    // setupEventListeners();



    // 初期化処理
    initialize();
});

// コントローラーの状態
let isSkipping = false;
let clickResolver = null;
let lastDrawCount = 1; // v0.08.1: リトライ用に記憶

function initialize() {
    // インフォメーション表示
    if (typeof INFO_MESSAGE !== 'undefined') {
        window.gachaView.showInfo(INFO_MESSAGE);
    }

    // 統計情報の更新
    const stats = window.gachaLogic.getStats();
    window.gachaView.renderStats(stats);

    // 履歴モダルの外側クリックイベント
    window.onclick = function (event) {
        const modal = document.getElementById('history-modal');
        if (event.target == modal) {
            closeHistory();
        }
    }
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

    // 抽選実行
    const { results, gateText } = window.gachaLogic.draw(count);

    // ゲートテキスト表示
    window.gachaView.showGateText(gateText);

    // リスト枠作成
    window.gachaView.renderInitialList(results);

    // 演出開始
    await runPresentation(results);

    // 終了処理
    window.gachaView.finishGacha();

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

// 履歴関連
function openHistory() {
    const history = window.gachaLogic.getHistory();
    window.gachaView.renderHistory(history);
}

function closeHistory() {
    window.gachaView.closeHistory();
}

function clearHistory() {
    if (confirm("履歴をすべて削除しますか？")) {
        window.gachaLogic.clearHistory();
        openHistory(); // 表示更新
    }
}

// v0.07 画像生成
function generateImage() {
    window.gachaView.generateImage();
}

// グローバルに公開
window.pullGacha = pullGacha;
window.retryGacha = retryGacha; // New
window.backToTitle = backToTitle; // New
window.skipAnimation = skipAnimation;
window.resetGacha = resetGacha;
window.openHistory = openHistory;
window.closeHistory = closeHistory;
window.clearHistory = clearHistory;
window.generateImage = generateImage;

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
