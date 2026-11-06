/*
 * Placeholders in email templates: "Hi {{lead.firstName}}" becomes "Hi Rahul" when a template
 * is picked in the compose box. Filled in the browser, so the person sees (and can change)
 * the exact text before sending. Used by Settings > Email templates and the Emails tab.
 */

export const TEMPLATE_VARIABLES = [
    { key: "lead.firstName", label: "First name", example: "Rahul" },
    { key: "lead.name", label: "Full name", example: "Rahul Mehta" },
    { key: "lead.company", label: "Their company", example: "Acme" },
    { key: "deal.title", label: "Deal", example: "Acme: Annual licence" },
    { key: "deal.amount", label: "Deal amount", example: "₹2,50,000" },
    { key: "me.name", label: "Your name", example: "Priya Sharma" },
    { key: "me.email", label: "Your email", example: "priya@yourcompany.com" },
    { key: "workspace.name", label: "Your company", example: "Flash" },
] as const;

export type TemplateValues = Partial<Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string | null>>;

// {{ lead.name }} → its value; one with no value (no company on this lead) becomes empty
export function fillTemplate(text: string, values: TemplateValues) {
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key as keyof TemplateValues] ?? "");
}

// A few to start from: offered on the empty templates page, and already in the demo workspace
export const STARTER_TEMPLATES = [
    {
        name: "First reply",
        subject: "Thanks for getting in touch, {{lead.firstName}}",
        body: "Hi {{lead.firstName}},\n\nThanks for reaching out to {{workspace.name}}. I'd love to understand what you're looking for. Would a 15-minute call this week work for you?\n\nBest,\n{{me.name}}",
    },
    {
        name: "Follow-up",
        subject: "Following up",
        body: "Hi {{lead.firstName}},\n\nJust checking in on my last message. Is this still something you're exploring? Happy to answer any questions.\n\nBest,\n{{me.name}}",
    },
    {
        name: "Proposal sent",
        subject: "Your proposal from {{workspace.name}}",
        body: "Hi {{lead.firstName}},\n\nAs promised, here's the proposal we discussed for {{lead.company}}. Let me know a good time to go through it together.\n\nBest,\n{{me.name}}",
    },
];
