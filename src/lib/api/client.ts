import axios from "axios";

export const api = axios.create({
    baseURL: "/api",
    headers: {
        "Content-Type": "application/json",
    },
});

// The workspace's trial or plan ran out while a page was open: off to Billing, where it says so
api.interceptors.response.use(undefined, (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 402 && error.response.data?.locked && window.location.pathname !== "/settings/billing") {
        // a full load (no router here), so the layout renders the lock screen
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/settings/billing");
    }
    return Promise.reject(error);
});

// A list's filters as query params. Lists of ids (several stages, say) travel as "1,4,7",
// and custom-field filters as one JSON-encoded param, the way the list routes read them.
// Used by every list and board, so each sends its filters the same way.
export function toQueryParams(filters: object) {
    const params: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === "") continue;
        if (Array.isArray(value)) {
            if (value.length > 0) params[key] = value.join(",");
        } else if (key === "customFields" && typeof value === "object" && value !== null) {
            if (Object.keys(value).length > 0) params[key] = JSON.stringify(value);
        } else {
            params[key] = value;
        }
    }

    return params;
}

// The API's own message: a field error first ("Invalid email"), then the general one
// ("Email is already registered")
export function errorMessage(error: unknown) {
    // no response at all: the server is down or the network dropped
    if (axios.isAxiosError(error) && !error.response) {
        return "Can't reach the server. Check your connection and try again.";
    }

    const data = axios.isAxiosError(error) ? error.response?.data : undefined;
    const fieldError = data?.errors && Object.values<string[]>(data.errors).flat()[0];

    return fieldError || data?.message || "Something went wrong. Please try again.";
}
