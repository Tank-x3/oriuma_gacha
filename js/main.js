/* =========================================
   Gacha Main Controller
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    // インスタンス化
    window.gachaLogic = new GachaLogic();
    window.gachaView = new GachaView();

    // 初期化処理
    initialize();
});

// コントローラーの状態
let isSkipping = false;
let clickResolver = null;

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

    // UIリセット
    window.gachaView.resetForDraw();
    isSkipping = false;

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

    // 統計情報の更新（実装数などは変わらないが念のため）
    // window.gachaView.renderStats(window.gachaLogic.getStats()); 
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

// グローバルに公開
window.pullGacha = pullGacha;
window.skipAnimation = skipAnimation;
window.resetGacha = resetGacha;
window.openHistory = openHistory;
window.closeHistory = closeHistory;
window.clearHistory = clearHistory;

// =========================================
// 演出進行ロジック
// =========================================

async function runPresentation(results) {
    // ゲートテキストを少し見せる時間
    await sleep(isSkipping ? 0 : 800);

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
    // 昇格演出
    if (res.isPromotion) {
        if (res.promotionType === 'TO_4_FROM_3') {
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 4);
        }
        else if (res.promotionType === 'TO_4_FROM_2') {
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 3);
            await sleep(isSkipping ? 0 : 600);
            window.gachaView.updateStar(rowId, 4);
        }
        else if (res.promotionType === 'C') { // 3 from 1
            await sleep(isSkipping ? 0 : 300);
            window.gachaView.updateStar(rowId, 2);
            await sleep(isSkipping ? 0 : 600);
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

    // 名前とセリフの表示
    await sleep(isSkipping ? 0 : 200);
    window.gachaView.updateRow(rowId, res);
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
    // ボタンのクリックは除外しないと、ボタンイベントと競合する可能性があるが
    // 元の実装では document.click で resolve しているためそれに従う。
    // ただし、ボタン自体がクリックされたときもここが発火する。
    // clickResolverがあれば解決するだけなので副作用は少ないはず。

    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
});
