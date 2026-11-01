"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconChevronDown,
    IconDots,
    IconLoader2,
    IconPencil,
    IconPlus,
    IconSearch,
    IconTrash,
    IconUsers,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { createAgentSchema } from "@/lib/validations/agents";
import { Avatar } from "@/components/Avatar";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { SidePanel } from "@/components/SidePanel";

interface Member {
    id: number;
    name: string;
    email: string;
    createdAt: string;
    role: { id: number; name: string };
}

interface Role {
    id: number;
    name: string;
    permissions: { permission: { name: string } }[];
}

interface Me {
    id: number;
    permissions: string[];
}

interface Can {
    create: boolean;
    update: boolean;
    delete: boolean;
    seeRoles: boolean;
}

const editMemberSchema = createAgentSchema.pick({ name: true, email: true });

export default function MembersView({ me, can }: { me: Me; can: Can }) {
    const queryClient = useQueryClient();
    const router = useRouter();

    const [search, setSearch] = useState("");
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<Member | null>(null);
    const [deleting, setDeleting] = useState<Member | null>(null);

    const members = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: Member[] }>("/agents").then((res) => res.data.data),
    });

    const roles = useQuery({
        queryKey: ["roles"],
        queryFn: () => api.get<{ data: Role[] }>("/roles").then((res) => res.data.data),
        enabled: can.seeRoles,
    });

    // The API only lets you manage roles that have no permission you lack.
    // Without the role list we can't tell, so we allow it and let the API decide.
    const isManageable = (roleId: number) => {
        const role = roles.data?.find((r) => r.id === roleId);
        return !roles.data || (!!role && role.permissions.every(({ permission }) => me.permissions.includes(permission.name)));
    };
    const manageableRoles = roles.data?.filter((role) => isManageable(role.id)) ?? [];

    function refresh() {
        queryClient.invalidateQueries({ queryKey: ["agents"] });
        queryClient.invalidateQueries({ queryKey: ["roles"] }); // member counts
        router.refresh(); // the sidebar shows your own name, in case you edited yourself
    }

    const changeRole = useMutation({
        mutationFn: ({ id, roleId }: { id: number; roleId: number }) => api.patch(`/agents/${id}`, { roleId }),
        onSuccess: refresh,
    });

    const remove = useMutation({
        mutationFn: (id: number) => api.delete(`/agents/${id}`),
        onSuccess: () => {
            setDeleting(null);
            refresh();
        },
    });

    const term = search.trim().toLowerCase();
    const shown = members.data?.filter(
        (member) => member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term)
    );

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <IconUsers size={16} className="text-[#838383]" />
                <h1 className="font-semibold">Members</h1>
                {members.data && <span className="text-faint">{members.data.length}</span>}

                {can.create && can.seeRoles && (
                    <button
                        onClick={() => setAdding(true)}
                        className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-accent px-2 font-medium text-on-accent hover:bg-accent-hover"
                    >
                        <IconPlus size={14} />
                        Add member
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <h2 className="text-lg font-semibold">Members</h2>
                    <p className="mt-1 text-muted">Everyone who can sign in to this workspace, and the role that decides what they can do.</p>

                    <label className="mt-6 flex h-8 items-center gap-2 rounded-lg border border-line px-2 focus-within:border-accent">
                        <IconSearch size={14} className="text-faint" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email"
                            className="flex-1 bg-transparent outline-none placeholder:text-light"
                        />
                    </label>

                    {changeRole.isError && (
                        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                            {errorMessage(changeRole.error)}
                        </p>
                    )}

                    {members.isPending && <p className="mt-4 text-faint">Loading members...</p>}
                    {members.isError && <p className="mt-4 text-danger">{errorMessage(members.error)}</p>}

                    {shown && (
                        <ul className="mt-3 rounded-lg border border-line">
                            {shown.map((member) => {
                                const isMe = member.id === me.id;
                                const manageable = isManageable(member.role.id);
                                const canEdit = can.update && manageable;
                                const canDelete = can.delete && manageable && !isMe;

                                return (
                                    <li key={member.id} className="flex h-14 items-center gap-3 border-b border-line-light px-3 last:border-b-0">
                                        <Avatar name={member.name} size="md" />

                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-1.5 font-medium">
                                                <span className="truncate">{member.name}</span>
                                                {isMe && <span className="rounded bg-app px-1.5 text-sm font-normal text-muted">You</span>}
                                            </p>
                                            <p className="truncate text-muted">{member.email}</p>
                                        </div>

                                        {/* Role: a menu when you may change it (never your own, the API refuses that) */}
                                        <div className="w-40">
                                            {canEdit && !isMe && roles.data ? (
                                                <Dropdown
                                                    align="right"
                                                    buttonClassName="flex h-7 max-w-full items-center gap-1 rounded-lg px-2 text-muted hover:bg-fill hover:text-ink"
                                                    label={<><span className="truncate">{member.role.name}</span><IconChevronDown size={14} className="shrink-0 text-faint" /></>}
                                                >
                                                    {(close) =>
                                                        manageableRoles.map((role) => (
                                                            <MenuItem
                                                                key={role.id}
                                                                selected={role.id === member.role.id}
                                                                onClick={() => {
                                                                    if (role.id !== member.role.id) changeRole.mutate({ id: member.id, roleId: role.id });
                                                                    close();
                                                                }}
                                                            >
                                                                {role.name}
                                                            </MenuItem>
                                                        ))
                                                    }
                                                </Dropdown>
                                            ) : (
                                                <span className="block truncate px-2 text-muted">{member.role.name}</span>
                                            )}
                                        </div>

                                        <span className="w-24 text-faint">{formatDate(member.createdAt)}</span>

                                        <div className="w-7">
                                            {(canEdit || canDelete) && (
                                                <Dropdown
                                                    align="right"
                                                    buttonClassName="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                                                    label={<><IconDots size={16} /><span className="sr-only">Actions for {member.name}</span></>}
                                                >
                                                    {(close) => (
                                                        <>
                                                            {canEdit && (
                                                                <MenuItem onClick={() => { setEditing(member); close(); }}>
                                                                    <IconPencil size={16} /> Edit
                                                                </MenuItem>
                                                            )}
                                                            {canDelete && (
                                                                <MenuItem danger onClick={() => { remove.reset(); setDeleting(member); close(); }}>
                                                                    <IconTrash size={16} /> Delete
                                                                </MenuItem>
                                                            )}
                                                        </>
                                                    )}
                                                </Dropdown>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}

                            {shown.length === 0 && <li className="px-3 py-6 text-center text-faint">No members match.</li>}
                        </ul>
                    )}
                </div>
            </div>

            <SidePanel open={adding} onClose={() => setAdding(false)}>
                <AddMemberForm
                    roles={manageableRoles}
                    onClose={() => setAdding(false)}
                    onSaved={() => {
                        setAdding(false);
                        refresh();
                    }}
                />
            </SidePanel>

            <SidePanel open={editing !== null} onClose={() => setEditing(null)}>
                {editing && (
                    <EditMemberForm
                        member={editing}
                        onClose={() => setEditing(null)}
                        onSaved={() => {
                            setEditing(null);
                            refresh();
                        }}
                    />
                )}
            </SidePanel>

            <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
                <div className="p-6">
                    <h2 className="text-lg font-semibold">Delete {deleting?.name}?</h2>
                    <p className="mt-2 text-muted">
                        They can no longer sign in. Their leads become unassigned. This can&apos;t be undone.
                    </p>

                    {remove.isError && (
                        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                            {errorMessage(remove.error)}
                        </p>
                    )}

                    <div className="mt-6 flex justify-end gap-2">
                        <button
                            onClick={() => setDeleting(null)}
                            className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => deleting && remove.mutate(deleting.id)}
                            disabled={remove.isPending}
                            className="h-8 rounded-lg bg-danger px-3 font-medium text-white hover:bg-[#dd3e42] disabled:opacity-60"
                        >
                            {remove.isPending ? "Deleting..." : "Delete"}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

interface AddMemberFormProps {
    roles: Role[];
    onClose: () => void;
    onSaved: () => void;
}

function AddMemberForm({ roles, onClose, onSaved }: AddMemberFormProps) {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        // the same schema POST /api/agents validates with
        resolver: zodResolver(createAgentSchema),
        defaultValues: { roleId: roles[0]?.id },
    });

    const create = useMutation({
        mutationFn: (values: unknown) => api.post("/agents", values),
        onSuccess: onSaved,
    });

    return (
        <form noValidate onSubmit={handleSubmit((values) => create.mutate(values))}>
            <h2 className="border-b border-line-light px-5 py-4 text-lg font-semibold">Add member</h2>

            <div className="space-y-3 px-5 py-4">
                <div>
                    <label htmlFor="member-name" className="mb-1 block text-sm font-medium text-muted">
                        Name
                    </label>
                    <input
                        id="member-name"
                        autoFocus
                        placeholder="Jane Cooper"
                        aria-invalid={!!errors.name}
                        {...register("name")}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
                </div>

                <div>
                    <label htmlFor="member-email" className="mb-1 block text-sm font-medium text-muted">
                        Email
                    </label>
                    <input
                        id="member-email"
                        type="email"
                        placeholder="jane@company.com"
                        aria-invalid={!!errors.email}
                        {...register("email")}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
                </div>

                <div>
                    <label htmlFor="member-password" className="mb-1 block text-sm font-medium text-muted">
                        Starting password
                    </label>
                    <input
                        id="member-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        aria-invalid={!!errors.password}
                        {...register("password")}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.password ? (
                        <p className="mt-1 text-sm text-danger">{errors.password.message}</p>
                    ) : (
                        <p className="mt-1 text-sm text-faint">Share it with them so they can sign in.</p>
                    )}
                </div>

                <div>
                    <label htmlFor="member-role" className="mb-1 block text-sm font-medium text-muted">
                        Role
                    </label>
                    <select
                        id="member-role"
                        {...register("roleId", { valueAsNumber: true })}
                        className="h-8 w-full rounded-lg border border-line bg-surface px-1.5 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    >
                        {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                                {role.name}
                            </option>
                        ))}
                    </select>
                </div>

                {create.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(create.error)}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line-light px-5 py-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={create.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {create.isPending && <IconLoader2 size={14} className="animate-spin" />}
                    Add member
                </button>
            </div>
        </form>
    );
}

interface EditMemberFormProps {
    member: Member;
    onClose: () => void;
    onSaved: () => void;
}

function EditMemberForm({ member, onClose, onSaved }: EditMemberFormProps) {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(editMemberSchema),
        defaultValues: { name: member.name, email: member.email },
    });

    const update = useMutation({
        mutationFn: (values: unknown) => api.patch(`/agents/${member.id}`, values),
        onSuccess: onSaved,
    });

    return (
        <form noValidate onSubmit={handleSubmit((values) => update.mutate(values))}>
            <h2 className="border-b border-line-light px-5 py-4 text-lg font-semibold">Edit member</h2>

            <div className="space-y-3 px-5 py-4">
                <div>
                    <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-muted">
                        Name
                    </label>
                    <input
                        id="edit-name"
                        autoFocus
                        aria-invalid={!!errors.name}
                        {...register("name")}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
                </div>

                <div>
                    <label htmlFor="edit-email" className="mb-1 block text-sm font-medium text-muted">
                        Email
                    </label>
                    <input
                        id="edit-email"
                        type="email"
                        aria-invalid={!!errors.email}
                        {...register("email")}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
                </div>

                {update.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(update.error)}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line-light px-5 py-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={update.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {update.isPending && <IconLoader2 size={14} className="animate-spin" />}
                    Save
                </button>
            </div>
        </form>
    );
}
