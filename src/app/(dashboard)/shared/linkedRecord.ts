import { IconAddressBook, IconCurrencyRupee, IconTargetArrow } from "@tabler/icons-react";

// A task or an activity can be about one lead, deal or contact
interface RecordLinks {
    lead: { id: number; name: string } | null;
    deal: { id: number; title: string } | null;
    contact: { id: number; name: string } | null;
}

// The record it belongs to, ready to show as a link
export function linkedRecord(item: RecordLinks) {
    if (item.lead) return { icon: IconTargetArrow, label: item.lead.name, href: `/leads?open=${item.lead.id}` };
    if (item.deal) return { icon: IconCurrencyRupee, label: item.deal.title, href: `/deals?open=${item.deal.id}` };
    if (item.contact) return { icon: IconAddressBook, label: item.contact.name, href: `/contacts?open=${item.contact.id}` };
    return null;
}
