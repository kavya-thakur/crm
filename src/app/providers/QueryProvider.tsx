"use client";

import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";

interface QueryProviderProps {
    children: React.ReactNode;
}

export default function QueryProvider({
    children,
}: QueryProviderProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // What's loaded stays good for 5 minutes: coming back to a page shows it without
                        // asking again. It doesn't go stale meanwhile, because every change (anyone's, or a
                        // web form's, an import's, an automation's) is announced over the live connection
                        // and refetched straight away (LiveUpdates), and everything is refetched when that
                        // connection comes back after a drop.
                        staleTime: 5 * 60 * 1000,
                        retry: 1,
                        refetchOnWindowFocus: false,
                    },
                    mutations: {
                        retry: 0,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}