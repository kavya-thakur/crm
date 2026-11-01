import axios from "axios";

export const api = axios.create({
    baseURL: "/api",
    headers: {
        "Content-Type": "application/json",
    },
});

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
