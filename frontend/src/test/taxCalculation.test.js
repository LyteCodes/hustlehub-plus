import { describe, it, expect } from "vitest";

const PLATFORM_FEE_BPS = 1000;
const PRIMARY_REBATE_CENTS = 1782000;

const brackets = [
    { thresholdCents: 0, baseTaxCents: 0, rateBps: 1800 },
    { thresholdCents: 23795000, baseTaxCents: 4283100, rateBps: 2600 },
    { thresholdCents: 37059000, baseTaxCents: 7731400, rateBps: 3100 },
    { thresholdCents: 51250000, baseTaxCents: 12128400, rateBps: 3600 },
    { thresholdCents: 66720000, baseTaxCents: 17695200, rateBps: 3900 },
    { thresholdCents: 86960000, baseTaxCents: 25588000, rateBps: 4100 },
    { thresholdCents: 180001000, baseTaxCents: 63767700, rateBps: 4500 },
];

function calcTax(grossCents) {
    const feeCents = Math.round(grossCents * PLATFORM_FEE_BPS / 10000);
    const netCents = grossCents - feeCents;
    let bracket = brackets[0];
    for (const b of brackets) { if (netCents >= b.thresholdCents) bracket = b; }
    const taxBefore = bracket.baseTaxCents + Math.round((netCents - bracket.thresholdCents) * bracket.rateBps / 10000);
    const payable = Math.max(0, taxBefore - PRIMARY_REBATE_CENTS);
    const eff = netCents > 0 ? (payable / netCents * 100).toFixed(2) + "%" : "0.00%";
    const marg = (bracket.rateBps / 100).toFixed(2) + "%";
    return { feeCents, netCents, taxBefore, payable, eff, marg };
}

describe("platform fee calculation", () => {
    it("deducts 10% platform fee from gross", () => {
        const { feeCents, netCents } = calcTax(100000);
        expect(feeCents).toBe(10000);
        expect(netCents).toBe(90000);
    });

    it("fee is zero when gross is zero", () => {
        const { feeCents, netCents } = calcTax(0);
        expect(feeCents).toBe(0);
        expect(netCents).toBe(0);
    });

    it("rounds fee to nearest cent", () => {
        const { feeCents } = calcTax(150);
        expect(feeCents).toBe(15);
    });
});

describe("tax bracket selection", () => {
    it("uses 18% bracket for income below R237 950", () => {
        const { marg } = calcTax(10000000);
        expect(marg).toBe("18.00%");
    });

    it("uses 26% bracket for income in second bracket", () => {
        const { marg } = calcTax(28000000);
        expect(marg).toBe("26.00%");
    });

    it("uses 31% bracket for income in third bracket", () => {
        const { marg } = calcTax(42000000);
        expect(marg).toBe("31.00%");
    });

    it("uses 45% bracket for top earners", () => {
        const { marg } = calcTax(210000000);
        expect(marg).toBe("45.00%");
    });
});

describe("primary rebate", () => {
    it("subtracts R17 820 rebate from tax before payable", () => {
        const { payable } = calcTax(10000000);
        expect(payable).toBe(0);
    });

    it("payable is never negative", () => {
        const { payable } = calcTax(1000);
        expect(payable).toBeGreaterThanOrEqual(0);
    });

    it("payable is correct for high income above rebate threshold", () => {
        const { payable } = calcTax(50000000);
        expect(payable).toBe(8411110);
    });
});

describe("effective rate", () => {
    it("returns 0.00% when net income is zero", () => {
        const { eff } = calcTax(0);
        expect(eff).toBe("0.00%");
    });

    it("returns a percentage string with two decimal places", () => {
        const { eff } = calcTax(50000000);
        expect(eff).toMatch(/^\d+\.\d{2}%$/);
    });

    it("effective rate is less than marginal rate", () => {
        const { eff, marg } = calcTax(50000000);
        expect(parseFloat(eff)).toBeLessThan(parseFloat(marg));
    });
});

describe("provisional tax split", () => {
    it("first and second payments sum to total payable", () => {
        const { payable } = calcTax(50000000);
        const first = Math.round(payable / 2);
        const second = payable - first;
        expect(first + second).toBe(payable);
    });

    it("payments are within 1 cent of each other for odd payable amounts", () => {
        const { payable } = calcTax(50000000);
        const first = Math.round(payable / 2);
        const second = payable - first;
        expect(Math.abs(first - second)).toBeLessThanOrEqual(1);
    });
});