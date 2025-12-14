/* =========================================
   Gacha View Module
   ========================================= */

/**
 * 画面表示(DOM)を制御するクラス
 * v0.07: Name parsing, CSS Grid structure, Image Generation
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
     * 結果リストの枠を作成
     * v0.07: CSS Grid用に構造変更
     * @param {Array} results 
     */
    renderInitialList(results) {
        results.forEach((res, index) => {
            const li = document.createElement('li');
            li.id = `result-row-${index}`;
            li.className = 'result-row'; // Grid Container

            // 1. カーソル (Absolute or Grid item)
            // Gridレイアウト内で扱いやすくするため、専用のコンテナに入れるか、
            // あるいはStarの前に配置するかが考えられるが、
            // 既存CSSとの兼ね合いで今回は span として最初に追加する（Grid側で位置調整可能にする）
            const marker = document.createElement('span');
            marker.className = 'cursor-marker';
            marker.textContent = '▶';
            marker.style.visibility = 'hidden';
            li.appendChild(marker);

            // 2. Star
            const starSpan = document.createElement('span');
            starSpan.className = `star-text rarity-${res.displayRarity}`;
            starSpan.textContent = this._getStarString(res.displayRarity);
            starSpan.id = `star-${index}`;
            li.appendChild(starSpan);

            // 3. Title (肩書き)
            const titleSpan = document.createElement('span');
            titleSpan.className = 'char-title';
            titleSpan.textContent = ''; // 初期は空
            titleSpan.id = `title-${index}`;
            li.appendChild(titleSpan);

            // 4. Name (名前)
            const nameSpan = document.createElement('span');
            nameSpan.className = 'char-name';
            nameSpan.textContent = '？？？';
            nameSpan.id = `name-${index}`;
            li.appendChild(nameSpan);

            // 5. Quote (セリフ)
            const quoteDiv = document.createElement('div');
            quoteDiv.className = 'char-quote';
            quoteDiv.id = `quote-${index}`;
            li.appendChild(quoteDiv);

            this.elResultList.appendChild(li);
        });
    }

    /**
     * 結果を1行確定表示する
     * v0.07: 名前パース処理を追加
     * @param {number} index 
     * @param {Object} res 
     */
    updateRow(index, res) {
        const elTitle = document.getElementById(`title-${index}`);
        const elName = document.getElementById(`name-${index}`);
        const elQuote = document.getElementById(`quote-${index}`);

        // 名前のパース
        // 例: "[トレセン学園理事長]秋川理事長" -> Title: "[トレセン学園理事長]", Name: "秋川理事長"
        // 例: "［ポンタ王国王女］ポンタ" -> Title: "［ポンタ王国王女］", Name: "ポンタ"
        const fullName = res.character.name;
        // 正規表現: 先頭にある [] または ［］ で囲まれた部分を抽出
        const match = fullName.match(/^([\[［].+?[\]］])(.*)$/);

        let titleText = "";
        let nameText = fullName;

        if (match) {
            titleText = match[1];
            nameText = match[2]; // 残りの部分
        }

        elTitle.textContent = titleText;
        elName.textContent = nameText;

        // ★3以上なら強調 & セリフ表示
        if (res.realRarity >= 3) {
            elName.classList.add(`rarity-${res.realRarity}`);
            // Titleにもレアリティ色を適用するかは要件にないが、統一感のため適用してもよい
            // 現状はNameのみ適用

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

    // =========================================
    // v0.07 Image Generation (Overlay Method)
    // =========================================

    async generateImage() {
        if (!window.domtoimage) {
            alert("画像生成ライブラリの読み込みに失敗しました。");
            return;
        }

        // 1. オーバーレイ生成 (画面外に配置してチラツキ防止)
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '-9999px'; // v0.07 Fix: 画面外へ
        overlay.style.width = '1000px'; // 十分な幅確保
        overlay.style.height = 'auto'; // または100%
        overlay.style.zIndex = '9999';
        overlay.style.backgroundColor = '#222'; // 透過防止用背景
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'flex-start';
        overlay.style.overflow = 'visible';
        // ユーザーに見えないように透明度を下げる手もあるが、dom-to-imageは可視要素しか撮れないことがある
        // ここでは撮影用コンテナを画面外に置くのではなく、前面に被せて撮影する

        // 2. 撮影用コンテナ (幅800px固定)
        const container = document.createElement('div');
        container.classList.add('force-desktop'); // v0.07 Fix: 強制PCレイアウト
        container.style.width = '800px';
        container.style.backgroundColor = '#222'; // アプリ背景色
        container.style.padding = '20px';
        container.style.boxSizing = 'border-box';
        container.style.color = '#eee';
        container.style.fontFamily = getComputedStyle(document.body).fontFamily;

        // ヘッダー追加
        const header = document.createElement('h1');
        header.textContent = 'オリウマ ガチャ結果';
        header.style.textAlign = 'center';
        header.style.color = '#fff';
        header.style.borderBottom = '2px solid #4CAF50';
        header.style.paddingBottom = '10px';
        header.style.marginBottom = '20px';
        container.appendChild(header);

        // リストのクローン
        // クローン時にIDが重複するが、画像化直後に破棄するので許容、またはID削除する
        // ここでは単純な cloneNode(true)
        const listClone = this.elResultList.cloneNode(true);
        listClone.id = 'result-list-clone';
        // クローンのスタイル調整（もし必要なら）
        // スクロールなどが絡まないよう overflow visible
        listClone.style.overflow = 'visible';
        listClone.style.height = 'auto';

        container.appendChild(listClone);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        try {
            // 3. 画像生成
            // 少し待機してレンダリングを安定させる（画像読み込み等は無いはずだが）
            await new Promise(r => setTimeout(r, 100));

            const dataUrl = await window.domtoimage.toPng(container, {
                width: 800,
                height: container.offsetHeight,
                style: {
                    // 強制的にPCレイアウトのスタイルを適用させるためのクラス付与等は
                    // クローン元のHTML構造とCSS(min-width:600px)に依存する。
                    // コンテナ幅800pxなので、メディアクエリ(min-width:600px)が有効になるはず…
                    // だが dom-to-image は window context を使うので、
                    // スマホで実行している(window.innerWidth < 600)場合、メディアクエリが効かない可能性がある。

                    // ★重要: iframe技法を使わない場合、閲覧環境のviewport幅が適用される恐れがある。
                    // dom-to-image-more はコピーしたノードをiframe内で描画して撮影するオプションがあるか？
                    // 標準の dom-to-image はない。

                    // 対策: style.cssのメディアクエリに頼らず、
                    // 撮影用コンテナには「PC用レイアウトクラス」を付与し、
                    // CSS側でもそのクラスがあればPCレイアウトになるように修正する必要があるかもしれない。
                    // しかし今回は指示書通り「幅800pxのコンテナ」で試みる。
                    // もしスマホでPCレイアウトにならない場合、style.css の修正が必要。
                }
            });

            // 4. ダウンロード
            const link = document.createElement('a');
            link.download = `gacha_result_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();

        } catch (error) {
            console.error('Image generation failed:', error);
            alert('画像の生成に失敗しました。');
        } finally {
            // 5. お片付け
            document.body.removeChild(overlay);
        }
    }

    _getStarString(rarity) {
        if (rarity === 999) return "★GOD★";
        return '★'.repeat(rarity);
    }
}
