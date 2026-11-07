/*
 * WhatsApp without an API: a wa.me link opens the chat in WhatsApp (the app, or WhatsApp Web)
 * with the message already typed, and the person presses send themselves. Free, and nothing
 * to set up. Used by the WhatsApp button next to phone numbers.
 */

// A phone number the way wa.me wants it: digits only, country code first; null if it can't be one.
// ponytail: a 10-digit number is taken as Indian (+91); numbers from elsewhere need their + code saved.
export function whatsappNumber(phone: string) {
    const digits = phone.replace(/\D/g, "").replace(/^00/, "");
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(number: string, text?: string) {
    return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
