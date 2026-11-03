import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { formTexts, readFormSettings } from "@/lib/validations/leadForms";
import HostedForm, { type HostedField } from "./HostedForm";

type Props = { params: Promise<{ key: string }> };

// The form, its workspace's name, and the lead custom fields it asks for (in its order)
async function loadForm(key: string) {
    const form = await prisma.leadForm.findUnique({ where: { key }, include: { organization: { select: { name: true } } } });
    // a lead integration's key has no page of its own
    if (!form || form.kind !== "FORM") return null;

    const settings = readFormSettings(form.settings);
    const definitions = await prisma.customFieldDefinition.findMany({
        where: { organizationId: form.organizationId, entity: "lead", key: { in: settings.customFields.map((field) => field.key) }, type: { not: "AGENT" } },
        select: { key: true, label: true, type: true, options: true },
    });
    const customFields: HostedField[] = settings.customFields.flatMap((field) => {
        const definition = definitions.find((item) => item.key === field.key);
        return definition ? [{ ...definition, options: (definition.options as string[] | null) ?? [], required: field.required }] : [];
    });

    return { form, settings, customFields };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const loaded = await loadForm((await params).key);
    return {
        title: loaded ? formTexts(loaded.settings, loaded.form.name).title : "Form not found",
        // a company's own form, shared by link: not something for search engines
        robots: { index: false, follow: false },
    };
}

/**
 * A web form's own page, at /f/<key>: the link a marketing team shares anywhere (an
 * Instagram bio, WhatsApp, a QR code, an email) when there's no website to put it on.
 * Public, no login. What it asks is set up in Settings > Web forms.
 */
export default async function FormPage({ params }: Props) {
    const { key } = await params;
    const loaded = await loadForm(key);
    if (!loaded) notFound();

    const { form, settings, customFields } = loaded;

    return (
        <HostedForm
            formKey={key}
            workspace={form.organization.name}
            texts={formTexts(settings, form.name)}
            intro={settings.intro}
            redirectUrl={settings.redirectUrl}
            builtIn={{ email: settings.email, company: settings.company, message: settings.message }}
            customFields={customFields}
        />
    );
}
