/* =========================================
   Gacha Logic Module
   (依存: config.js, characters.js)
   ========================================= */

/**
 * ガチャの抽選ロジックとデータ管理を行うクラス
 * v0.07: Guaranteed Logic Update
 */
class GachaLogic {
    constructor() {
        this.HISTORY_KEY = 'oriuma_gacha_history_v1';
    }

    /**
     * ガチャを引く
     * @param {number} count - 回数 (1 or 10)
     * @returns {Object} 抽選結果 { results: Array, gateText: String }
     */
    draw(count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            let currentRates = RATES;
            let isGuaranteed = false;

            // 10連の10枠目（インデックス9）は確定枠
            if (count === 10 && i === 9) {
                currentRates = GUARANTEED_RATES;
                isGuaranteed = true;
            }

            const rarity = this._pickRarity(currentRates);
            const character = this._pickCharacter(rarity);

            // 確定枠かどうかを渡す
            const promotion = this._checkPromotion(rarity, isGuaranteed);

            results.push({
                realRarity: rarity,
                displayRarity: promotion.initialRarity,
                character: character,
                isPromotion: promotion.isPromotion,
                promotionType: promotion.type
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
        return [
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

    _pickRarity(rates) {
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

    _pickCharacter(rarity) {
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
                // 確定枠の場合、★1からの昇格はありえない（最低★2）ので、
                // ★2始動か★3始動のみ許可する。
                // 既存ロジックは "R4_START_FROM_R3" (40%) と Else (60%) なので
                // Elseの場合は R2 -> R4 となる。これは整合する。
                // よって変更不要。
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
                // Pattern C: ★1 -> ★2 -> ★3 (2段階昇格)
                // 確定枠(isGuaranteed)の場合は★1表示が許されないため、このパターンは禁止。
                // 代わりに Pattern B (★2 -> ★3) にフォールバックするか、昇格なしにする。
                // ここでは Pattern B にフォールバックする。
                if (isGuaranteed) {
                    return { isPromotion: true, initialRarity: 2, type: 'B' };
                }
                return { isPromotion: true, initialRarity: 1, type: 'C' };
            }
            if (rand <= PROMOTION_CHATES.HIDE_R3_STRONG + PROMOTION_CHATES.HIDE_R3_WEAK) {
                // Pattern B: ★2 -> ★3
                // これは確定枠でもOK。
                return { isPromotion: true, initialRarity: 2, type: 'B' };
            }
        }

        // ★2 (SR)
        if (realRarity === 2) {
            // Pattern A: ★1 -> ★2
            if (rand <= PROMOTION_CHATES.HIDE_R2) {
                // 確定枠の場合、★1表示は許されないため禁止。
                // 昇格なし（最初から★2表示）とする。
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
                isPromotion: res.isPromotion
            });
        });

        if (history.length > 100) {
            history = history.slice(0, 100);
        }

        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    }
}
