"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBrandWhatsapp } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { fillTemplate, type TemplateValues } from "@/lib/emails/templates";
import { whatsappLink, whatsappNumber } from "@/lib/whatsapp";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { useEmailTemplates } from "./emails";

/**
 * The WhatsApp button next to a phone number: opens the chat in WhatsApp, empty or with one of
 * the workspace's templates already typed (the email templates' text, filled in for this
 * person), and notes it on the record's timeline. Nothing shows for a number WhatsApp can't use.
 */
export function WhatsAppButton({
    phone,
    entity,
    recordId,
    values,
}: {
    phone: string | null;
    entity: "lead" | "deal" | "contact";
    recordId: number;
    values: TemplateValues;
}) {
    const queryClient = useQueryClient();
    const templatesQuery = useEmailTemplates();
    const number = phone ? whatsappNumber(phone) : null;

    const log = useMutation({
        mutationFn: (template?: string) => api.post("/whatsapp", { [`${entity}Id`]: recordId, template }),
        // the timeline shows "Opened a WhatsApp chat"
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [entity] }),
    });

    if (!number) return null;

    const me = templatesQuery.data?.me;
    const filled: TemplateValues = { ...values, "me.name": me?.name, "me.email": me?.email, "workspace.name": me?.workspace };
    const templates = templatesQuery.data?.data ?? [];

    // opened in the click itself, so the browser doesn't block it as a pop-up
    function openChat(text?: string, template?: string) {
        window.open(whatsappLink(number!, text), "_blank", "noopener,noreferrer");
        log.mutate(template);
    }

    return (
        <Dropdown
            align="right"
            buttonClassName="flex size-7 shrink-0 items-center justify-center rounded-lg text-success hover:bg-success-soft"
            label={
                <>
                    <IconBrandWhatsapp size={17} />
                    <span className="sr-only">WhatsApp</span>
                </>
            }
        >
            {(close) => (
                <>
                    <MenuItem
                        onClick={() => {
                            openChat();
                            close();
                        }}
                    >
                        Open chat
                    </MenuItem>
                    {templates.length > 0 && <p className="px-1.5 pt-2 pb-1 text-sm text-faint">With a message</p>}
                    {templates.map((template) => (
                        <MenuItem
                            key={template.id}
                            onClick={() => {
                                openChat(fillTemplate(template.body, filled), template.name);
                                close();
                            }}
                        >
                            {template.name}
                        </MenuItem>
                    ))}
                </>
            )}
        </Dropdown>
    );
}
