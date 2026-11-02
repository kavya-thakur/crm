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

// "₹2,50,000": money on the dashboard, in whole rupees
export const formatMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format;

// "₹12.5K", "₹2.5L", "₹3.5Cr": for chart axes and other tight spots
export const formatMoneyShort = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
}).format;
