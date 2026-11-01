// Standard placeholder business names (Acme, Globex, Northwind, Contoso,
// Initech) — no real companies are named as customers, Flash doesn't have any yet.
const SAMPLE_WORKSPACES = ["Acme Inc", "Globex Corp", "Northwind Traders", "Contoso", "Initech"];

export function LogoBar() {
    return (
        <section data-reveal className="border-y border-line bg-paper py-10">
            <div className="mx-auto max-w-5xl px-6">
                <p className="text-center font-(family-name:--font-host-grotesk) text-sm text-light">
                    Loved by fast-moving sales teams
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
                    {SAMPLE_WORKSPACES.map((name) => (
                        <span key={name} className="font-(family-name:--font-aleo) text-lg text-light">
                            {name}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
