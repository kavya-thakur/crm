import { prisma } from "@/lib/db/prisma";
import type { CurrentUser } from "@/lib/auth/requirePermission";
import { allAgentsInOrganization } from "@/lib/work/activities";
import type { AutomationRuleInput } from "@/lib/validations/automations";

/**
 * The people and templates a rule's actions point at have to be this workspace's own.
 * Returns what's wrong, in words, or null.
 */
export async function checkReferences(user: CurrentUser, rule: Pick<AutomationRuleInput, "actions">) {
    for (const action of rule.actions) {
        if (action.type === "assign" && !(await allAgentsInOrganization(action.userIds, user.organizationId))) {
            return "Everyone a lead is assigned to has to be in this workspace";
        }
        if (action.type === "email") {
            const template = await prisma.emailTemplate.findFirst({ where: { id: action.templateId, organizationId: user.organizationId }, select: { id: true } });
            if (!template) return "That email template doesn't exist any more";
        }
    }
    return null;
}
