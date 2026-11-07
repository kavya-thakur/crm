export function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// For date-only values like a task's due day, which are stored as midnight UTC:
// formatting in the viewer's own timezone would show the day before in the Americas
export function formatDay(date: string) {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// "Nov 5, 2026, 3:30 PM" in the viewer's own timezone, for a moment in time like a meeting
export function formatDateTime(date: string) {
    return new Date(date).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// "2 hours ago", "yesterday"
export function timeAgo(date: string) {
    const seconds = (new Date(date).getTime() - Date.now()) / 1000;
    const steps: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60],
    ];

    for (const [unit, size] of steps) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return "just now";
}

// The currencies a workspace can pick (Settings > Workspace). Amounts are plain numbers in the
// database: the currency only decides how they're shown
export const CURRENCIES = [
    { code: "INR", name: "Indian rupee" },
    { code: "USD", name: "US dollar" },
    { code: "EUR", name: "Euro" },
    { code: "GBP", name: "British pound" },
    { code: "AED", name: "UAE dirham" },
    { code: "SAR", name: "Saudi riyal" },
    { code: "SGD", name: "Singapore dollar" },
    { code: "AUD", name: "Australian dollar" },
    { code: "CAD", name: "Canadian dollar" },
    { code: "JPY", name: "Japanese yen" },
    { code: "NPR", name: "Nepalese rupee" },
    { code: "BDT", name: "Bangladeshi taka" },
    { code: "LKR", name: "Sri Lankan rupee" },
    { code: "ZAR", name: "South African rand" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// The workspace's currency, in the browser: set once by the dashboard layout (WorkspaceCurrency),
// before any page under it renders
let workspaceCurrency = "INR";
export function setWorkspaceCurrency(code: string) {
    workspaceCurrency = code;
}

// Indian grouping (₹2,50,000) for rupees, the usual (2,500,000) for everything else
const formats = new Map<string, Intl.NumberFormat>();
function money(currency: string, options: Intl.NumberFormatOptions) {
    const key = `${currency}:${JSON.stringify(options)}`;
    let format = formats.get(key);
    if (!format) {
        format = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, ...options });
        formats.set(key, format);
    }
    return format;
}

// "₹2,50,000" / "$250,000": money in whole units, in a given currency (the server uses this)
export function formatMoneyIn(value: number, currency: string) {
    return money(currency, { maximumFractionDigits: 0 }).format(value);
}

// The same in the workspace's currency. One argument only, so it can be handed straight to a chart
export function formatMoney(value: number) {
    return formatMoneyIn(value, workspaceCurrency);
}

// "₹12.5K", "₹2.5L", "$3.5M": for chart axes and other tight spots
export function formatMoneyShort(value: number) {
    return money(workspaceCurrency, { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value);
}

// A deal's exact amount: "₹3,20,000", with paise (or cents) only when there are any. The server
// passes the currency (the printable quote); the browser has the workspace's already
export function formatMoneyExact(value: number, currency = workspaceCurrency) {
    return money(currency, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

// "₹", "$": for labels like "Amount (₹)"
export function currencySymbol() {
    return money(workspaceCurrency, {}).formatToParts(0).find((part) => part.type === "currency")?.value ?? workspaceCurrency;
}
