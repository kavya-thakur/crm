import { STAGE_COLORS } from "./stageColors";

// Every organization starts with these sources (created on register, back-filled by the seed).
export const DEFAULT_LEAD_SOURCES = [
    { name: "Website", order: 0, color: STAGE_COLORS.sky },
    { name: "Referral", order: 1, color: STAGE_COLORS.emerald },
    { name: "Social Media", order: 2, color: STAGE_COLORS.purple },
    { name: "Email", order: 3, color: STAGE_COLORS.amber },
    { name: "Phone", order: 4, color: STAGE_COLORS.rose },
    { name: "Other", order: 5, color: STAGE_COLORS.slate },
];
