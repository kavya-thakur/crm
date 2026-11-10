"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconClockPlus,
  IconCrown,
  IconLogin2,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDate, formatMoneyIn } from "@/lib/utils/format";
import {
  BILLING_CYCLES,
  PRO_PLANS,
  type BillingCycle,
} from "@/lib/billing/plans";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { Pill } from "@/components/Pill";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { count, PlanCell } from "./parts";

export interface PaymentRow {
  id: number;
  createdAt: string;
  paidBy: string;
  method: "RAZORPAY" | "MANUAL";
  cycle: string;
  // rupees
  amount: number;
  paidUntil: string;
  razorpayPaymentId: string | null;
  note: string | null;
  recordedBy: string | null;
}

interface WorkspaceDetail {
  id: number;
  name: string;
  createdAt: string;
  currency: string;
  billingCycle: string | null;
  planRequest: string | null;
  planRequestedAt: string | null;
  access: {
    state: "trial" | "pro" | "ended";
    endsAt: string | null;
    daysLeft: number;
  };
  counts: { users: number; leads: number; deals: number; contacts: number };
  teamEmail: string | null;
  owner: { id: number; name: string; email: string } | null;
  members: {
    id: number;
    name: string;
    email: string;
    isOwner: boolean;
    createdAt: string;
    role: { name: string };
  }[];
  payments: PaymentRow[];
  paidTotal: number;
}

export const rupees = (amount: number) => formatMoneyIn(amount, "INR");

/**
 * One company, in a side panel: who owns it, its plan, how much it uses Flash, its people and
 * every payment, with what a site admin can do about it (record a payment and switch Pro on,
 * give the trial more days, log in as the owner, see its people).
 */
export function WorkspacePanel({
  id,
  onClose,
  onShowPeople,
}: {
  id: number;
  onClose: () => void;
  onShowPeople: (workspace: { id: number; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);

  const query = useQuery({
    queryKey: ["site-admin", "workspace", id],
    queryFn: () =>
      api
        .get<{ data: WorkspaceDetail }>(`/site-admin/workspaces/${id}`)
        .then((res) => res.data.data),
  });

  const changed = (message: string) => {
    toast.success(message);
    setRecording(false);
    void queryClient.invalidateQueries({ queryKey: ["site-admin"] });
  };
  const extend = useMutation({
    mutationFn: () =>
      api.put<{ message: string }>(`/site-admin/workspaces/${id}`, {
        action: "extendTrial",
      }),
    onSuccess: (res) => changed(res.data.message),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const logInAs = useMutation({
    mutationFn: (userId: number) => api.post(`/site-admin/users/${userId}`),
    onSuccess: () => {
      // a full load: the whole app is theirs now, and the live connection reconnects as them
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/my-day";
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const workspace = query.data;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-line-light px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">
            {workspace?.name ?? "…"}
          </h2>
          {workspace && (
            <p className="text-sm text-faint">
              Signed up {formatDate(workspace.createdAt)}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
        >
          <IconX size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {query.isPending && <PageLoader label="Loading company" />}
        {query.isError && (
          <ErrorState
            title="Couldn't load this company"
            error={query.error}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {workspace && (
          <>
            <Section title="Owner">
              {workspace.owner ? (
                <p>
                  <span className="font-medium">{workspace.owner.name}</span>{" "}
                  <a
                    href={`mailto:${workspace.owner.email}`}
                    className="text-accent hover:underline"
                  >
                    {workspace.owner.email}
                  </a>
                </p>
              ) : (
                <p className="text-faint">No owner on record</p>
              )}
            </Section>

            <Section title="Plan">
              <PlanCell workspace={workspace} />
              <p className="mt-1 text-sm text-muted">
                {workspace.access.state === "pro" &&
                  workspace.billingCycle &&
                  `Pro ${PRO_PLANS[workspace.billingCycle as BillingCycle]?.label.toLowerCase()}, `}
                {workspace.access.endsAt &&
                  `${workspace.access.state === "ended" ? "ended" : "ends"} ${formatDate(workspace.access.endsAt)}`}
                {workspace.planRequestedAt &&
                  ` · asked for Pro ${formatDate(workspace.planRequestedAt)}`}
              </p>
            </Section>

            <Section title="Using Flash">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {(
                  [
                    ["People", workspace.counts.users],
                    ["Leads", workspace.counts.leads],
                    ["Deals", workspace.counts.deals],
                    ["Contacts", workspace.counts.contacts],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-faint">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {count(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-sm text-muted">
                Team email:{" "}
                {workspace.teamEmail ?? (
                  <span className="text-faint">not set up</span>
                )}{" "}
                · Currency: {workspace.currency}
              </p>
            </Section>

            <Section title={`Payments · ${rupees(workspace.paidTotal)} in all`}>
              {workspace.payments.length === 0 ? (
                <p className="text-faint">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-line-light rounded-xl border border-line">
                  {workspace.payments.map((payment) => (
                    <PaymentLine key={payment.id} payment={payment} />
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`People · ${count(workspace.counts.users)}`}>
              <ul className="divide-y divide-line-light rounded-xl border border-line text-sm">
                {workspace.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{member.name}</span>{" "}
                      <span className="text-faint">{member.email}</span>
                    </span>
                    {member.isOwner && <Pill tone="amber">Owner</Pill>}
                    <span className="shrink-0 text-faint">
                      {member.role.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {recording && (
              <RecordPaymentForm
                workspaceId={workspace.id}
                onDone={changed}
                onCancel={() => setRecording(false)}
              />
            )}
          </>
        )}
      </div>

      {workspace && !recording && (
        // what a site admin can do about this company, always in reach
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line-light bg-surface px-5 py-3">
          <button
            type="button"
            onClick={() => setRecording(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
          >
            <IconCrown size={15} /> Record a payment
          </button>
          {/* only before or after Pro: a trial would replace a plan they paid for */}
          {workspace.access.state !== "pro" && (
            <button
              type="button"
              onClick={() => extend.mutate()}
              disabled={extend.isPending}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill disabled:opacity-60"
            >
              <IconClockPlus size={15} /> Trial +7 days
            </button>
          )}
          {workspace.owner && (
            <button
              type="button"
              onClick={() => logInAs.mutate(workspace.owner!.id)}
              disabled={logInAs.isPending}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill disabled:opacity-60"
            >
              <IconLogin2 size={15} /> Log in as owner
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onShowPeople({ id: workspace.id, name: workspace.name })
            }
            className="flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium text-muted hover:bg-fill"
          >
            <IconUsers size={15} /> All its people
          </button>
        </footer>
      )}
    </div>
  );
}

// A payment taken another way (UPI, bank transfer, cash): what was received, and a reference.
// Saving it switches Pro on for the month or year (added on to what's running) and records it.
function RecordPaymentForm({
  workspaceId,
  onDone,
  onCancel,
}: {
  workspaceId: number;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("YEARLY");
  const [amount, setAmount] = useState(String(PRO_PLANS.YEARLY.price));
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.put<{ message: string }>(`/site-admin/workspaces/${workspaceId}`, {
        action: "activate",
        cycle,
        amount: Number(amount),
        note: note.trim() || undefined,
      }),
    onSuccess: (res) => onDone(res.data.message),
  });

  const input =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (amount !== "" && Number(amount) >= 0) save.mutate();
      }}
      className="space-y-3 rounded-xl border border-accent/30 bg-accent-faint p-4"
    >
      <p className="font-medium">Record a payment and switch Pro on</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-muted">Plan</span>
          <Select
            value={cycle}
            onChange={(value) => {
              if (!value) return;
              setCycle(value as BillingCycle);
              setAmount(String(PRO_PLANS[value as BillingCycle].price));
            }}
            options={BILLING_CYCLES.map((item) => ({
              value: item,
              label: `Pro ${PRO_PLANS[item].label.toLowerCase()}`,
            }))}
            placeholder="Plan"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-muted">
            Amount received (₹)
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={input}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-muted">
          Reference (optional)
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          placeholder="UPI 4521…, bank transfer, or why it's free"
          className={input}
        />
      </label>
      <p className="text-sm text-faint">
        {
          "0 switches it on without a payment (a favour, a partner); it's still recorded."
        }
      </p>
      {save.isError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {errorMessage(save.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg border border-line bg-surface px-3 font-medium text-muted hover:bg-fill"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={save.isPending || amount === ""}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {save.isPending && <Spinner size={14} />}
          Save and switch Pro on
        </button>
      </div>
    </form>
  );
}

// One payment: when, how much, for what, and how (online with its Razorpay id, or manual with its reference)
export function PaymentLine({
  payment,
  company,
}: {
  payment: PaymentRow;
  company?: { name: string; onOpen: () => void };
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
      <span className="w-24 shrink-0 text-faint">
        {formatDate(payment.createdAt)}
      </span>
      {company && (
        <button
          type="button"
          onClick={company.onOpen}
          className="max-w-48 truncate font-medium text-ink hover:underline"
        >
          {company.name}
        </button>
      )}
      <span className="font-semibold tabular-nums">
        {rupees(payment.amount)}
      </span>
      <span className="text-muted">
        Pro{" "}
        {PRO_PLANS[payment.cycle as BillingCycle]?.label.toLowerCase() ??
          payment.cycle}
      </span>
      {payment.method === "RAZORPAY" ? (
        <Pill tone="green">Online</Pill>
      ) : (
        <Pill tone="blue">Manual</Pill>
      )}
      <span className="w-full min-w-0 truncate text-faint sm:w-auto sm:flex-1">
        {payment.method === "RAZORPAY"
          ? payment.razorpayPaymentId
          : [payment.note, payment.recordedBy && `by ${payment.recordedBy}`]
              .filter(Boolean)
              .join(" · ")}
        {` · until ${formatDate(payment.paidUntil)}`}
      </span>
    </li>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold tracking-wide text-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
