/*
 * The "Flash Demo" workspace: 18 months of believable sales activity, so visitors (and the
 * dashboard) have something real to look at. Built by `npm run db:demo` and rebuilt every night
 * by the demo queue (src/lib/jobs/worker.ts), so whatever visitors change is undone.
 * Rebuilding replaces the demo workspace and nothing else; real organizations are never touched.
 * DEMO_SCALE=25 makes it 25 times bigger (about 10,000 leads and 7,500 deals), to check every
 * page stays fast with a large workspace.
 */
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/deals/stages";
import { DEFAULT_LEAD_STAGES } from "@/lib/leads/stages";
import { DEFAULT_LEAD_SOURCES } from "@/lib/leads/sources";
import { LOST_REASONS } from "@/lib/leads/lostReasons";
import { STARTER_TEMPLATES, fillTemplate } from "@/lib/emails/templates";

// how the demo workspace is recognised, and who visitors explore it as
export const DEMO_SLUG = "flash-demo";
const LOGIN = { email: "demo@flash-demo.dev", password: "demo1234" };
export const DEMO_PEOPLE = {
    // sees the whole team: every lead, deal and the team table
    manager: { email: LOGIN.email, label: "Manager" },
    // a sales rep: only their own leads and deals
    agent: { email: "priya@flash-demo.dev", label: "Sales agent" },
} as const;
const SLUG = DEMO_SLUG;
const DAY = 24 * 60 * 60 * 1000;
const SCALE = Math.max(1, Number(process.env.DEMO_SCALE) || 1);

// Postgres takes at most ~65,000 values in one statement, so big batches are saved in slices
async function inChunks<T>(rows: T[], save: (chunk: T[]) => Promise<unknown>) {
    for (let index = 0; index < rows.length; index += 2000) {
        await save(rows.slice(index, index + 2000));
    }
}

// The manager you sign in as, then the reps. `skill` makes some clearly better than others,
// so the team table has a story to tell.
const PEOPLE = [
    { name: "Ananya Rao", email: LOGIN.email, skill: 0.6, manager: true },
    { name: "Aarav Mehta", email: "aarav@flash-demo.dev", skill: 1.45 },
    { name: "Priya Sharma", email: "priya@flash-demo.dev", skill: 1.2 },
    { name: "Rohan Iyer", email: "rohan@flash-demo.dev", skill: 0.95 },
    { name: "Sneha Kapoor", email: "sneha@flash-demo.dev", skill: 0.8 },
    { name: "Vikram Singh", email: "vikram@flash-demo.dev", skill: 0.55 },
];

const COMPANIES = [
    "Acme Logistics", "Bluepeak Foods", "Cedar Health", "Dhruva Steel", "Everlane Textiles", "Fintrail Capital",
    "Greenleaf Organics", "Horizon Realty", "Indus Motors", "Jasper Labs", "Kaveri Pharma", "Lotus Hotels",
    "Monsoon Media", "Nimbus Cloud", "Orchid Retail", "Pinnacle Infra", "Quartz Electronics", "Riverstone Schools",
    "Saffron Kitchens", "Tidewater Shipping", "Umbra Studios", "Vertex Telecom", "Willow Clinics", "Zenith Insurance",
];
const PRODUCTS = ["Annual licence", "Pilot rollout", "Team plan", "Enterprise upgrade", "Onboarding package", "Renewal", "Add-on seats"];

// utm tags on the demo's ad links; the weights make some campaigns clearly bigger than others
const CAMPAIGNS = [
    { utmCampaign: "diwali-sale", utmSource: "google", utmMedium: "cpc", weight: 5 },
    { utmCampaign: "linkedin-webinar", utmSource: "linkedin", utmMedium: "social", weight: 3 },
    { utmCampaign: "instagram-reels", utmSource: "instagram", utmMedium: "social", weight: 4 },
    { utmCampaign: "october-newsletter", utmSource: "newsletter", utmMedium: "email", weight: 2 },
];
const campaignTags = ({ utmCampaign, utmSource, utmMedium }: (typeof CAMPAIGNS)[number]) => ({ utmCampaign, utmSource, utmMedium });
const TASKS = ["Send proposal", "Follow up on pricing", "Share case study", "Prepare demo", "Update contract", "Check in after trial"];
const MEETINGS = ["Discovery call", "Product demo", "Pricing discussion", "Contract review", "Quarterly check-in"];
const NOTES = [
    "Spoke to their head of ops. Budget is approved for Q1, they want a pilot with two teams first.",
    "They're comparing us with two other vendors. Price matters, but onboarding speed matters more.",
    "Asked for a case study from a company their size. Sending the logistics one tomorrow.",
    "Decision maker is the CFO, not the person we've been talking to. Need an intro.",
    "Very keen after the demo. Follow up on Friday with the revised quote.",
    "Legal review of the contract is taking longer than expected. Expect two more weeks.",
];

// A small seeded random generator, so every build is the same demo (reset at the start of each)
let seed = 42;
function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
// picks by weight: bigger weight, picked more often
function weighted<T>(items: T[], weightOf: (item: T) => number) {
    let roll = random() * items.reduce((sum, item) => sum + weightOf(item), 0);
    return items.find((item) => (roll -= weightOf(item)) < 0) ?? items[0];
}
// days ago, skewed toward recent so the charts show a growing business
const recentDaysAgo = (span: number) => Math.floor(span * random() ** 1.5);
const daysFrom = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const utcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

async function removeOldDemo() {
    const old = await prisma.organization.findUnique({ where: { slug: SLUG } });
    if (!old) return;
    const organizationId = old.id;
    // children first, the same order the tests clean up in
    await prisma.task.deleteMany({ where: { organizationId } });
    await prisma.scheduledActivity.deleteMany({ where: { organizationId } });
    await prisma.dealNote.deleteMany({ where: { deal: { organizationId } } });
    await prisma.dealTimeline.deleteMany({ where: { deal: { organizationId } } });
    await prisma.deal.deleteMany({ where: { organizationId } });
    await prisma.leadNote.deleteMany({ where: { lead: { organizationId } } });
    await prisma.leadTimeline.deleteMany({ where: { lead: { organizationId } } });
    await prisma.lead.deleteMany({ where: { organizationId } });
    await prisma.contactNote.deleteMany({ where: { contact: { organizationId } } });
    await prisma.contactTimeline.deleteMany({ where: { contact: { organizationId } } });
    await prisma.contact.deleteMany({ where: { organizationId } });
    await prisma.savedFilter.deleteMany({ where: { user: { organizationId } } });
    // things visitors may have added since the last build
    await prisma.leadForm.deleteMany({ where: { organizationId } });
    await prisma.emailTemplate.deleteMany({ where: { organizationId } });
    await prisma.company.deleteMany({ where: { organizationId } });
    await prisma.customFieldDefinition.deleteMany({ where: { organizationId } });
    await prisma.pipelineStage.deleteMany({ where: { organizationId } });
    await prisma.leadStage.deleteMany({ where: { organizationId } });
    await prisma.leadSource.deleteMany({ where: { organizationId } });
    await prisma.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.role.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
}

export async function buildDemoWorkspace() {
    seed = 42;
    await removeOldDemo();

    const now = new Date();
    const today = utcDay(now);
    const permissions = await prisma.permission.findMany();
    if (permissions.length === 0) throw new Error("Run `npx prisma db seed` first: there are no permissions yet");

    const organization = await prisma.organization.create({ data: { name: "Flash Demo", slug: SLUG } });
    const org = { organizationId: organization.id };

    // The manager sees everything; reps only their own leads and deals
    const repPermissions = ["lead:create", "lead:read", "lead:update", "deal:create", "deal:read", "deal:update", "contact:create", "contact:read", "contact:update"];
    const [adminRole, repRole] = await Promise.all([
        prisma.role.create({ data: { ...org, name: "Admin", permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } } }),
        prisma.role.create({
            data: {
                ...org,
                name: "Sales Rep",
                permissions: { create: permissions.filter((p) => repPermissions.includes(p.name)).map((p) => ({ permissionId: p.id })) },
            },
        }),
    ]);

    await prisma.pipelineStage.createMany({ data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, ...org })) });
    await prisma.leadStage.createMany({ data: DEFAULT_LEAD_STAGES.map((stage) => ({ ...stage, ...org })) });
    await prisma.leadSource.createMany({ data: DEFAULT_LEAD_SOURCES.map((source) => ({ ...source, ...org })) });
    const [pipeline, leadStages, sources] = await Promise.all([
        prisma.pipelineStage.findMany({ where: org, orderBy: { order: "asc" } }),
        prisma.leadStage.findMany({ where: org, orderBy: { order: "asc" } }),
        prisma.leadSource.findMany({ where: org, orderBy: { order: "asc" } }),
    ]);

    const passwordHash = await hashPassword(LOGIN.password);
    const people = await Promise.all(
        PEOPLE.map(async (person) => ({
            ...person,
            user: await prisma.user.create({
                data: { ...org, name: person.name, email: person.email, passwordHash, roleId: person.manager ? adminRole.id : repRole.id },
            }),
        })),
    );
    const manager = people[0].user;

    // --- Leads: 420 over 18 months (so last year has something to compare against), from the usual sources, at every stage ---
    const openLeadStages = leadStages.filter((stage) => !stage.isConverted && !stage.isLost);
    const customer = leadStages.find((stage) => stage.isConverted)!;
    const lostLead = leadStages.find((stage) => stage.isLost)!;
    const sourceWeights = [34, 24, 16, 12, 8, 6];

    await inChunks(
        Array.from({ length: 420 * SCALE }, (_, index) => {
            const owner = weighted(people, (person) => person.skill);
            const age = recentDaysAgo(545);
            // older leads have had time to convert or drop out; better reps convert more
            const settled = age > 14 && random() < Math.min(0.75, age / 40);
            const stage = settled ? (random() < 0.32 * owner.skill ? customer : lostLead) : pick(openLeadStages);
            const company = pick(COMPANIES);
            const createdAt = daysFrom(now, -age - random());
            return {
                ...org,
                name: `${["Rahul", "Meera", "Kabir", "Isha", "Arjun", "Divya", "Nikhil", "Tara"][index % 8]} from ${company}`,
                companyName: company,
                email: `contact${index}@${company.toLowerCase().replace(/\s+/g, "")}.example`,
                stageId: stage.id,
                lostReason: stage === lostLead ? pick(LOST_REASONS) : null,
                sourceId: weighted(sources, (source) => sourceWeights[source.order] ?? 4).id,
                // about a third came in through a tagged ad link, for the dashboard's campaign card
                ...(random() < 0.35 && campaignTags(weighted(CAMPAIGNS, (campaign) => campaign.weight))),
                assignedToId: owner.user.id,
                createdById: owner.user.id,
                updatedById: owner.user.id,
                createdAt,
                updatedAt: createdAt,
            };
        }),
        (data) => prisma.lead.createMany({ data }),
    );

    // --- Deals: 300 over 18 months; most older ones closed, the rest still in the pipeline ---
    const openStages = pipeline.filter((stage) => !stage.isWon && !stage.isLost);
    const won = pipeline.find((stage) => stage.isWon)!;
    const lost = pipeline.find((stage) => stage.isLost)!;
    const stageChance = [10, 25, 50, 75];
    // won deals come from converted leads, so the dashboard can show revenue per lead source
    const customerLeads = await prisma.lead.findMany({ where: { ...org, stageId: customer.id }, select: { id: true } });

    await inChunks(
        Array.from({ length: 300 * SCALE }, () => {
            const owner = weighted(people, (person) => person.skill);
            const age = recentDaysAgo(545) + 1;
            const createdAt = daysFrom(now, -age);
            // round amounts between ₹20K and ₹12L, mostly at the small end
            const amount = Math.round((20_000 + random() ** 2.2 * 1_180_000) / 5_000) * 5_000;
            const daysToClose = Math.round((8 + random() * 55) / Math.sqrt(owner.skill));
            const closedAt = daysFrom(createdAt, daysToClose);
            const title = `${pick(COMPANIES)}: ${pick(PRODUCTS)}`;

            if (closedAt < now && random() < 0.85) {
                const isWon = random() < Math.min(0.8, 0.38 * owner.skill);
                return {
                    ...org,
                    title,
                    amount,
                    assignedToId: owner.user.id,
                    createdById: owner.user.id,
                    updatedById: owner.user.id,
                    createdAt,
                    updatedAt: closedAt,
                    closedAt,
                    pipelineStageId: (isWon ? won : lost).id,
                    probability: isWon ? 100 : 0,
                    leadId: isWon && customerLeads.length > 0 ? pick(customerLeads).id : null,
                    lostReason: isWon ? null : pick(LOST_REASONS),
                };
            }

            const stageIndex = Math.min(openStages.length - 1, Math.floor(random() * openStages.length * Math.min(1, age / 30 + 0.3)));
            return {
                ...org,
                title,
                amount,
                assignedToId: owner.user.id,
                createdById: owner.user.id,
                updatedById: owner.user.id,
                createdAt,
                updatedAt: createdAt,
                pipelineStageId: openStages[stageIndex].id,
                probability: stageChance[stageIndex] ?? 50,
                // some are expected soon, a few have slipped past their date
                expectedCloseDate: utcDay(daysFrom(today, Math.round(-12 + random() * 60))),
            };
        }),
        (data) => prisma.deal.createMany({ data }),
    );

    // --- Tasks: finished work for everyone, and a few on the manager's plate today ---
    const doneTasks = people.flatMap((person) =>
        Array.from({ length: Math.round(28 * person.skill * SCALE) }, () => {
            const due = utcDay(daysFrom(today, -recentDaysAgo(120)));
            return {
                ...org,
                title: pick(TASKS),
                status: "COMPLETED" as const,
                dueDate: due,
                // finished up to two days before it was due
                completedAt: daysFrom(due, -random() * 2),
                assignedToId: person.user.id,
                createdById: manager.id,
            };
        }),
    );
    const managerTasks = [-3, -1, 0, 0, 2, 5].map((offset, index) => ({
        ...org,
        title: `${TASKS[index % TASKS.length]}: ${COMPANIES[index]}`,
        priority: (["HIGH", "MEDIUM", "HIGH", "LOW", "MEDIUM", "LOW"] as const)[index],
        // a couple already under way, so the board's middle column isn't empty
        status: index % 3 === 1 ? ("IN_PROGRESS" as const) : ("PENDING" as const),
        dueDate: utcDay(daysFrom(today, offset)),
        assignedToId: manager.id,
        createdById: manager.id,
    }));
    // and a few open ones on every rep's plate
    const repTasks = people.slice(1).flatMap((person) =>
        Array.from({ length: 4 }, (_, index) => ({
            ...org,
            title: `${pick(TASKS)}: ${pick(COMPANIES)}`,
            status: index === 0 ? ("IN_PROGRESS" as const) : ("PENDING" as const),
            priority: pick(["LOW", "MEDIUM", "HIGH"] as const),
            dueDate: utcDay(daysFrom(today, Math.round(-3 + random() * 14))),
            assignedToId: person.user.id,
            createdById: manager.id,
        })),
    );
    await inChunks([...doneTasks, ...managerTasks, ...repTasks], (data) => prisma.task.createMany({ data }));

    // --- Calls and meetings: held ones for everyone, and the manager's week ahead ---
    const held = people.flatMap((person) =>
        Array.from({ length: Math.round(22 * person.skill * SCALE) }, () => ({
            ...org,
            title: `${pick(MEETINGS)} with ${pick(COMPANIES)}`,
            type: random() < 0.55 ? ("CALL" as const) : ("MEETING" as const),
            status: "COMPLETED" as const,
            scheduledAt: daysFrom(now, -recentDaysAgo(120) - 0.3),
            durationMinutes: pick([15, 30, 45, 60]),
            assignedToId: person.user.id,
            createdById: person.user.id,
        })),
    );
    const upcoming = [0.2, 1.1, 2.3, 3.2, 5.1].map((offset, index) => {
        const at = daysFrom(today, Math.floor(offset));
        at.setUTCHours(4 + index * 2, index % 2 ? 30 : 0);
        return {
            ...org,
            title: `${MEETINGS[index]} with ${COMPANIES[index + 5]}`,
            type: index % 2 ? ("MEETING" as const) : ("CALL" as const),
            scheduledAt: at < now ? daysFrom(at, 1) : at,
            durationMinutes: index % 2 ? 60 : 30,
            assignedToId: manager.id,
            createdById: manager.id,
        };
    });
    await inChunks([...held, ...upcoming], (data) => prisma.scheduledActivity.createMany({ data }));

    // --- Notes on recent leads and deals, written by their owners, half of them @-mentioning
    // the manager (the notes page shows notes you wrote or are mentioned in) ---
    const [recentLeads, recentDeals] = await Promise.all([
        prisma.lead.findMany({ where: org, orderBy: { createdAt: "desc" }, take: 24, select: { id: true, assignedToId: true, createdAt: true } }),
        prisma.deal.findMany({ where: org, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, assignedToId: true, createdAt: true } }),
    ]);
    const note = (index: number, authorId: number, after: Date) => {
        const mention = index % 2 === 0;
        return {
            authorId,
            body: `${NOTES[index % NOTES.length]}${mention ? ` @${people[0].name} can you take a look?` : ""}`,
            mentionedUserIds: mention ? [manager.id] : [],
            createdAt: daysFrom(after, random() * Math.max(0.2, (now.getTime() - after.getTime()) / DAY)),
        };
    };
    await prisma.leadNote.createMany({
        data: recentLeads.map((lead, index) => ({ leadId: lead.id, ...note(index, lead.assignedToId ?? manager.id, lead.createdAt) })),
    });
    await prisma.dealNote.createMany({
        data: recentDeals.map((deal, index) => ({ dealId: deal.id, ...note(index + 1, deal.assignedToId ?? manager.id, deal.createdAt) })),
    });

    // --- Email templates, and emails already sent to the newest leads: most delivered, about half
    // of those opened, so the Emails tab shows every state. (The demo never sends real email.) ---
    await prisma.emailTemplate.createMany({ data: STARTER_TEMPLATES.map((template) => ({ ...org, ...template })) });
    const emailedLeads = await prisma.lead.findMany({
        where: { ...org, email: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 16,
        select: { id: true, name: true, email: true, companyName: true, createdAt: true, assignedTo: { select: { id: true, name: true, email: true } } },
    });
    await prisma.email.createMany({
        data: emailedLeads.map((lead, index) => {
            const template = STARTER_TEMPLATES[index % STARTER_TEMPLATES.length];
            const sender = lead.assignedTo ?? manager;
            const values = { "lead.firstName": lead.name.split(" ")[0], "lead.name": lead.name, "lead.company": lead.companyName, "me.name": sender.name, "me.email": sender.email, "workspace.name": organization.name };
            const sentAt = daysFrom(lead.createdAt, random() * Math.max(0.1, (now.getTime() - lead.createdAt.getTime()) / DAY) * 0.5);
            return {
                ...org,
                leadId: lead.id,
                sentById: sender.id,
                to: lead.email!,
                subject: fillTemplate(template.subject, values),
                body: fillTemplate(template.body, values),
                status: "SENT",
                sentAt,
                createdAt: sentAt,
                openedAt: index % 2 === 0 ? new Date(Math.min(now.getTime(), sentAt.getTime() + random() * DAY)) : null,
                trackingToken: `demo-${organization.id}-${index}-${Math.random().toString(36).slice(2)}`,
            };
        }),
    });

    console.log(`Demo workspace ready. Sign in as ${LOGIN.email} / ${LOGIN.password}`);
}

// Whether someone is in the demo workspace, where a few things are switched off (see assertNotDemo)
export function isDemoWorkspace(user: { organization: { slug: string } }) {
    return user.organization.slug === DEMO_SLUG;
}

/**
 * Called by the routes that would change the demo for everyone after them: signing in
 * details (password, name), members and roles. Everything else (leads, deals, imports...)
 * stays open to play with, and the nightly rebuild puts it back.
 */
export function assertNotDemo(user: { organization: { slug: string } }) {
    if (isDemoWorkspace(user)) throw new Error("DEMO");
}
