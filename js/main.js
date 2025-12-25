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

    // 完了後の追加UI操作（シェアボタンの表示など）があれば記述
    // 今回はHTML側に静的にはないので、必要なら追加する
    if (count === 10) {
        // 画像保存ボタンを表示するなどの制御をここに書いてもよい
        showShareButton();
    }
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
    hideShareButton();
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
window.skipAnimation = skipAnimation;
window.resetGacha = resetGacha;
window.openHistory = openHistory;
window.closeHistory = closeHistory;
window.clearHistory = clearHistory;
window.generateImage = generateImage;

// シェアボタン制御（簡易実装）
function showShareButton() {
    // 既存ボタンエリアに追加、または専用エリアを表示
    // 今回は既存の .control-area に動的に追加するか、
    // あるいは最初からHTMLにあってhiddenにしておくのがスマート。
    // 指示書には「HTML変更」として「DOM-to-Image追加」はあるが、
    // ボタン自体の追加指示が漏れている可能性がある。
    // ただし index.html を見ると share ボタンはない。
    // よって、ここで動的に追加するか、既存のエリアを活用する。

    // resetボタンの横にシェアボタンを追加するロジック
    // （既存の resetGacha で消す必要がある）

    let btn = document.getElementById('btn-share');
    if (!btn) {
        const resetBtn = document.getElementById('btn-reset');
        if (resetBtn && resetBtn.parentNode) {
            btn = document.createElement('button');
            btn.id = 'btn-share';
            btn.className = 'action-btn';
            btn.textContent = '📸 画像で保存';
            btn.onclick = generateImage;
            btn.style.marginLeft = '10px';
            btn.style.backgroundColor = '#9C27B0'; // 紫
            resetBtn.parentNode.appendChild(btn);
        }
    }
    if (btn) btn.classList.remove('hidden');
}

function hideShareButton() {
    const btn = document.getElementById('btn-share');
    if (btn) {
        btn.classList.add('hidden');
    }
}


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
    // ボタンのクリックは除外しないと、ボタンイベントと競合する可能性がある
    // ただし、ボタンonClickのあとにここに来る分には、clickResolverがあれば進むだけなので問題ない

    if (clickResolver) {
        const resolve = clickResolver;
        clickResolver = null;
        resolve();
    }
});
