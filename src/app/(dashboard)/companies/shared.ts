// What a signed-in person may do with companies (the contact permissions)
export interface CompanyPermissions {
    create: boolean;
    update: boolean;
    delete: boolean;
}

// "acme.com" from "https://www.acme.com/about", for showing; and a link that works without "https://"
export function websiteLabel(website: string) {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function websiteHref(website: string) {
    return /^https?:\/\//.test(website) ? website : `https://${website}`;
}
