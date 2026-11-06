import { prisma } from "@/lib/db/prisma";
import type { CurrentUser } from "@/lib/auth/requirePermission";
import { allAgentsInOrganization } from "@/lib/work/activities";
import { kindOf, type AutomationRuleInput } from "@/lib/validations/automations";

/**
 * The people, templates and stages a rule's actions point at have to be this workspace's own,
 * and a stage has to be the right kind: a lead stage for a lead rule, a pipeline stage for a
 * deal rule. Returns what's wrong, in words, or null.
 */
export async function checkReferences(user: CurrentUser, rule: Pick<AutomationRuleInput, "trigger" | "actions">) {
    const { organizationId } = user;

    for (const action of rule.actions) {
        if ((action.type === "assign" || action.type === "notify") && !(await allAgentsInOrganization(action.userIds, organizationId))) {
            return "Everyone it assigns to or notifies has to be in this workspace";
        }
        if (action.type === "email") {
            const template = await prisma.emailTemplate.findFirst({ where: { id: action.templateId, organizationId }, select: { id: true } });
            if (!template) return "That email template doesn't exist any more";
        }
        if (action.type === "move") {
            if (kindOf(rule.trigger) === "lead") {
                const stage = await prisma.leadStage.findFirst({ where: { id: action.stageId, organizationId }, select: { isConverted: true } });
                if (!stage) return "That lead stage doesn't exist any more";
                // a lead is converted by making it a deal, not by moving it
                if (stage.isConverted) return "Leads can't be moved to a converted stage; convert them to a deal instead";
            } else {
                const stage = await prisma.pipelineStage.findFirst({ where: { id: action.stageId, organizationId }, select: { id: true } });
                if (!stage) return "That pipeline stage doesn't exist any more";
            }
        }
    }
    return null;
}
