import { STAGE_COLORS } from "./stageColors";

// Every organization starts with these stages (created on register, back-filled by the seed).
export const DEFAULT_LEAD_STAGES = [
    { name: "New", order: 0, color: STAGE_COLORS.red },
    { name: "Screening", order: 1, color: STAGE_COLORS.purple },
    { name: "Meeting", order: 2, color: STAGE_COLORS.sky },
    { name: "Proposal", order: 3, color: STAGE_COLORS.emerald },
    { name: "Customer", order: 4, color: STAGE_COLORS.amber, isConverted: true },
    { name: "Lost", order: 5, color: STAGE_COLORS.slate, isLost: true },
];
