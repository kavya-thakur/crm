import { STAGE_COLORS } from "./stageColors";

// Every organization starts with these stages (created on register, back-filled by the seed).
export const DEFAULT_PIPELINE_STAGES = [
    { name: "New", order: 0, color: STAGE_COLORS.sky },
    { name: "Qualified", order: 1, color: STAGE_COLORS.purple },
    { name: "Proposal", order: 2, color: STAGE_COLORS.amber },
    { name: "Negotiation", order: 3, color: STAGE_COLORS.orange },
    { name: "Won", order: 4, color: STAGE_COLORS.green, isWon: true },
    { name: "Lost", order: 5, color: STAGE_COLORS.red, isLost: true },
];

// A deal entering a won or lost stage closes now; entering any other stage reopens it.
// Every route that puts a deal in a stage sets Deal.closedAt from this.
export function closedAtFor(stage: { isWon: boolean; isLost: boolean }) {
    return stage.isWon || stage.isLost ? new Date() : null;
}
