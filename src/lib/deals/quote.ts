/*
 * The money on a deal's quote. Used by the deal's Products tab, the printable quote and the API
 * (which keeps the deal's amount equal to the total), so all three always agree.
 */

export interface QuoteLine {
    price: number | string;
    quantity: number;
    discountPercent: number;
    taxPercent: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

// One line: price × quantity, less its discount, then its tax on top
export function lineAmounts(line: QuoteLine) {
    const gross = Number(line.price) * line.quantity;
    const net = round(gross * (1 - line.discountPercent / 100));
    const tax = round((net * line.taxPercent) / 100);
    return { gross: round(gross), discount: round(gross - net), net, tax, total: round(net + tax) };
}

// The whole quote; `total` (with tax) is what the customer pays, and the deal's amount
export function quoteTotals(lines: QuoteLine[]) {
    const sum = { gross: 0, discount: 0, net: 0, tax: 0, total: 0 };
    for (const line of lines) {
        const amounts = lineAmounts(line);
        for (const key of Object.keys(sum) as (keyof typeof sum)[]) sum[key] = round(sum[key] + amounts[key]);
    }
    return sum;
}
