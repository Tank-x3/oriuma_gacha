/* =========================================
   Gacha Logic Module
   (依存: config.js, characters.js)
   ========================================= */

/**
 * ガチャの抽選ロジックとデータ管理を行うクラス
 * v0.08: Pickup & Dynamic Rates Update
 */
class GachaLogic {
    constructor() {
        this.HISTORY_KEY = 'oriuma_gacha_history_v1';

        // 初期化処理: R1確率の自動計算
        this._initRates();

        // ピックアップ情報のキャッシュ
        this.pickupTotalRate = (PICKUP_CHAR_IDS.length * PICKUP_RATE_PER_CHAR);
    }

    _initRates() {
        // RATES.R1 を計算 (100 - 他の合計 - ピックアップ合計)
        // ※RATESはconfig.jsの定数だが、オブジェクトプロパティは変更可能

        let otherTotal = 0;
        if (RATES.GOD) otherTotal += RATES.GOD;
        if (RATES.R4) otherTotal += RATES.R4;
        otherTotal += RATES.R3;
        otherTotal += RATES.R2;

        const pickupTotal = (PICKUP_CHAR_IDS.length * PICKUP_RATE_PER_CHAR);

        RATES.R1 = 100 - (otherTotal + pickupTotal);

        // 念のため浮動小数点誤差を丸める (少数第3位まで)
        RATES.R1 = Math.round(RATES.R1 * 1000) / 1000;

        console.log("Calculated R1 Rate:", RATES.R1, "%");
    }

    /**
     * ガチャを引く
     * @param {number} count - 回数 (1 or 10)
     * @returns {Object} 抽選結果 { results: Array, gateText: String }
     */
    draw(count) {
        const results = [];
        const pickupTotal = this.pickupTotalRate;

        for (let i = 0; i < count; i++) {
            let currentRates = RATES;
            let isGuaranteed = false;
            let isPickup = false;
            let character = null;
            let realRarity = 0;

            // 10連の10枠目（インデックス9）は確定枠
            // ※確定枠にはピックアップ判定を含めるか？
            //  -> 通常の「R2以上確定」の場合、Pickup(R3相当)は条件を満たす。
            //  -> ここでは、確定枠でもまずPickup抽選を行い、外れたらGuaranteeテーブルを使う実装とする。

            if (count === 10 && i === 9) {
                currentRates = GUARANTEED_RATES;
                isGuaranteed = true;
            }

            // 抽選実行 (Single Random Number Logic)
            const rand = Math.random() * 100;

            // 1. ピックアップ判定 (確定枠でも有効とする)
            if (rand < pickupTotal) {
                isPickup = true;
                realRarity = 3; // Pickupは基本R3扱い (データ依存だが一旦R3とする)
                character = this._pickPickupCharacter();
                // キャラクターデータから本当のレアリティを取得 (念のため)
                // IDから検索が必要だが、_pickPickupCharacterが返すオブジェクトに含まれるか？
                // characters.jsのID体系から逆引きするのはコストが高いので、
                // _pickPickupCharacter 内で解決済みとする。
                // 簡易的に pickup IDリストは R3 前提とする。
            } else {
                // 2. 通常/確定枠 判定
                // ピックアップ判定に使った rand をそのまま使い、オフセットさせる
                // threshold start = pickupTotal
                realRarity = this._pickRarityWithOffset(currentRates, pickupTotal, rand);
                character = this._pickCharacter(realRarity);
            }

            // 確定枠かどうかを渡す
            const promotion = this._checkPromotion(realRarity, isGuaranteed);

            // スキップ中断判定: ★3以上 または 昇格演出あり
            const shouldStopSkip = (realRarity >= 3) || promotion.isPromotion;

            results.push({
                realRarity: realRarity,
                displayRarity: promotion.initialRarity,
                character: character,
                isPromotion: promotion.isPromotion,
                promotionType: promotion.type,
                shouldStopSkip: shouldStopSkip,
                isPickup: isPickup
            });
        }

        const gateText = this._decideGateText(results, count);

        // 履歴保存
        this._saveHistory(results);

        return { results, gateText };
    }

    /**
     * 現在の実装状況（統計情報）を取得する
     * @returns {Array} 統計データの配列
     */
    getStats() {
        // ピックアップ対象のリスト作成
        const pickupList = this._getPickupCharacters();

        return [
            { label: "PICKUP (★3)", rate: this.pickupTotalRate, list: pickupList },
            { label: "★3 (SSR)", rate: RATES.R3, list: CHARACTERS_R3 },
            { label: "★2 (SR)", rate: RATES.R2, list: CHARACTERS_R2 },
            { label: "★1 (R)", rate: RATES.R1, list: CHARACTERS_R1 }
        ];
    }

    /**
     * 履歴を取得する
     * @returns {Array} 履歴リスト
     */
    getHistory() {
        return JSON.parse(localStorage.getItem(this.HISTORY_KEY)) || [];
    }

    /**
     * 履歴を全消去する
     */
    clearHistory() {
        localStorage.removeItem(this.HISTORY_KEY);
    }

    // =========================================
    // Private Methods (Internal Logic)
    // =========================================

    _pickRarityWithOffset(rates, offset, rand) {
        let threshold = offset;

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

        // 残りはR1 (RATES.R1 or Guaranteed default)
        return 1;
    }

    _pickPickupCharacter() {
        if (!PICKUP_CHAR_IDS || PICKUP_CHAR_IDS.length === 0) {
            // Fallback (should not happen if rate > 0)
            return this._pickCharacter(3);
        }
        const index = Math.floor(Math.random() * PICKUP_CHAR_IDS.length);
        const id = PICKUP_CHAR_IDS[index];
        return this._findCharacterById(id);
    }

    _findCharacterById(id) {
        // IDから全探索 (R4, R3, R2, R1の順)
        let char = CHARACTERS_R4.find(c => c.id === id);
        if (char) return char;
        char = CHARACTERS_R3.find(c => c.id === id);
        if (char) return char;
        char = CHARACTERS_R2.find(c => c.id === id);
        if (char) return char;
        char = CHARACTERS_R1.find(c => c.id === id);
        if (char) return char;

        return { id: id, name: "Unknown", quote: "" };
    }

    _getPickupCharacters() {
        return PICKUP_CHAR_IDS.map(id => this._findCharacterById(id));
    }

    _pickCharacter(rarity) {
        let list = [];
        if (rarity === 999) return { name: "GOD PACK", quote: "GOD PACK!!" };
        else if (rarity === 4) list = CHARACTERS_R4;
        else if (rarity === 3) list = CHARACTERS_R3;
        else if (rarity === 2) list = CHARACTERS_R2;
        else list = CHARACTERS_R1;

        if (!list || list.length === 0) {
            // データがない場合のフォールバック
            return { id: "000", name: "データなし", quote: "" };
        }
        const index = Math.floor(Math.random() * list.length);
        return list[index];
    }

    /**
     * 昇格演出判定
     * @param {number} realRarity 真のレアリティ
     * @param {boolean} isGuaranteed 確定枠かどうか (v0.07追加)
     */
    _checkPromotion(realRarity, isGuaranteed = false) {
        const rand = Math.floor(Math.random() * 100) + 1;

        // ★4: 常に昇格演出
        if (realRarity === 4) {
            if (isGuaranteed) {
                // 確定枠の場合、★1からの昇格はありえない（最低★2）
            }

            if (rand <= PROMOTION_CHATES.R4_START_FROM_R3) {
                return { isPromotion: true, initialRarity: 3, type: 'TO_4_FROM_3' };
            } else {
                return { isPromotion: true, initialRarity: 2, type: 'TO_4_FROM_2' };
            }
        }

        // ★3 (SSR)
        if (realRarity === 3) {
            if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG) {
                // Pattern C: ★1 -> ★2 -> ★3
                if (isGuaranteed) {
                    return { isPromotion: true, initialRarity: 2, type: 'B' };
                }
                return { isPromotion: true, initialRarity: 1, type: 'C' };
            }
            if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG + PROMOTION_CHATES.HIDE_R3_WEAK) {
                // Pattern B: ★2 -> ★3
                return { isPromotion: true, initialRarity: 2, type: 'B' };
            }
        }

        // ★2 (SR)
        if (realRarity === 2) {
            if (rand <= PROMOTION_CHATES.HIDE_R2) {
                // Pattern A: ★1 -> ★2
                if (isGuaranteed) {
                    return { isPromotion: false, initialRarity: 2, type: null };
                }
                return { isPromotion: true, initialRarity: 1, type: 'A' };
            }
        }

        // 昇格なし
        return { isPromotion: false, initialRarity: realRarity, type: null };
    }

    _decideGateText(results, count) {
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

    _saveHistory(results) {
        let history = this.getHistory();

        const now = new Date();
        const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

        results.forEach(res => {
            history.unshift({
                date: timeStr,
                name: res.character.name,
                rarity: res.realRarity,
                isPromotion: res.isPromotion,
                isPickup: res.isPickup
            });
        });

        if (history.length > 100) {
            history = history.slice(0, 100);
        }

        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    }
}

