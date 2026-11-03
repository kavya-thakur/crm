"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronRight, IconPlus, IconUsers } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { SectionIcon } from "@/components/SectionIcon";
import { Pill } from "@/components/Pill";
import { SidePanel } from "@/components/SidePanel";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

interface Permission {
    id: number;
    name: string;
    description: string | null;
}

interface Role {
    id: number;
    name: string;
    permissions: { permission: Permission }[];
    _count: { users: number };
}

interface Me {
    roleId: number;
    permissions: string[];
}

interface Can {
    create: boolean;
    update: boolean;
    delete: boolean;
}

// The permission grid in the role editor: one row per area, one column per action
const AREAS = [
    { key: "lead", label: "Leads" },
    { key: "deal", label: "Deals" },
    { key: "contact", label: "Contacts" },
    { key: "user", label: "Members" },
    { key: "role", label: "Roles" },
];

// Whose work a member sees: without these, only their own
const SEE_EVERYONES = [
    { name: "lead:all", label: "Every lead", hint: "Otherwise only the leads assigned to them. Needed to assign leads." },
    { name: "deal:all", label: "Every deal", hint: "Otherwise only their own deals. Also shows the team on the dashboard." },
    { name: "contact:all", label: "Every contact", hint: "Otherwise only the contacts assigned to them." },
    { name: "task:all", label: "Every task", hint: "Anyone can add tasks. Otherwise they see their own and those on their records." },
    { name: "activity:all", label: "Every call & meeting", hint: "Otherwise only theirs and the ones they're tagged on." },
];

// Changing how the workspace is set up, for everyone in it
const SETUP = [
    { name: "pipeline:manage", label: "Pipeline stages", hint: "Add, rename, recolour, reorder and remove the deals board's stages." },
    { name: "lead-stages:manage", label: "Lead stages", hint: "The same for the leads board's stages." },
    { name: "lead-sources:manage", label: "Lead sources", hint: "The list of places leads come from." },
    { name: "custom-fields:manage", label: "Custom fields", hint: "Extra fields on leads, deals and contacts." },
    { name: "lead-forms:manage", label: "Web forms", hint: "Forms on your website that create leads by themselves." },
    { name: "email-templates:manage", label: "Email templates", hint: "Ready-made emails everyone can send from a lead or deal." },
];

const ACTIONS = [
    { key: "read", label: "View" },
    { key: "create", label: "Create" },
    { key: "update", label: "Edit" },
    { key: "delete", label: "Delete" },
];

export default function RolesView({ me, can }: { me: Me; can: Can }) {
    // null = dialog closed, "new" = creating, a role = editing it
    const [editing, setEditing] = useState<Role | "new" | null>(null);

    const roles = useQuery({
        queryKey: ["roles"],
        queryFn: () => api.get<{ data: Role[] }>("/roles").then((res) => res.data.data),
    });

    const permissions = useQuery({
        queryKey: ["permissions"],
        queryFn: () => api.get<{ data: Permission[] }>("/permissions").then((res) => res.data.data),
    });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="roles" size="md" />
                <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">Roles</h1>
                {roles.data && <span className="text-faint">{roles.data.length}</span>}

                {can.create && (
                    <button
                        onClick={() => setEditing("new")}
                        className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-accent px-2 font-medium text-on-accent hover:bg-accent-hover"
                    >
                        <IconPlus size={14} />
                        New role
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="roles" size="lg" />
                        <div className="min-w-0 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Roles</h2>
                            <p className="mt-0.5 text-muted">
                            A role decides what its members can do. Everyone with a role gets all of its permissions.
                        </p>
                        </div>
                    </div>

                    {roles.isPending && <PageLoader label="Loading roles" />}
                    {roles.isError && (
                        <ErrorState
                            title="Couldn't load roles"
                            error={roles.error}
                            onRetry={() => roles.refetch()}
                            retrying={roles.isFetching}
                        />
                    )}

                    {roles.data && (
                        <ul className="mt-6 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
                            {roles.data.map((role) => (
                                <li key={role.id} className="border-b border-line-light last:border-b-0">
                                    <button
                                        onClick={() => setEditing(role)}
                                        className="flex h-13 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-paper"
                                    >
                                        <SectionIcon section="roles" size="md" />
                                        <span className="font-medium">{role.name}</span>
                                        {role.id === me.roleId && (
                                            <Pill tone="rose">Your role</Pill>
                                        )}

                                        <span className="ml-auto">
                                            <Pill>
                                                {role.permissions.length} {role.permissions.length === 1 ? "permission" : "permissions"}
                                            </Pill>
                                        </span>
                                        <span className="flex w-14 items-center justify-end gap-1 text-muted" title="Members with this role">
                                            <IconUsers size={14} />
                                            {role._count.users}
                                        </span>
                                        <IconChevronRight size={16} className="text-light" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <SidePanel wide open={editing !== null} onClose={() => setEditing(null)}>
                {editing && permissions.data ? (
                    <RoleForm
                        role={editing === "new" ? null : editing}
                        allPermissions={permissions.data}
                        me={me}
                        can={can}
                        onDone={() => setEditing(null)}
                    />
                ) : permissions.isError ? (
                    <ErrorState
                        title="Couldn't load permissions"
                        error={permissions.error}
                        onRetry={() => permissions.refetch()}
                        retrying={permissions.isFetching}
                    />
                ) : (
                    <PageLoader label="Loading permissions" />
                )}
            </SidePanel>
        </div>
    );
}

interface RoleFormProps {
    role: Role | null;
    allPermissions: Permission[];
    me: Me;
    can: Can;
    onDone: () => void;
}

// Create (role = null) or edit a role: its name and its permission grid
function RoleForm({ role, allPermissions, me, can, onDone }: RoleFormProps) {
    const queryClient = useQueryClient();

    const originalIds = new Set(role?.permissions.map(({ permission }) => permission.id) ?? []);
    const [name, setName] = useState(role?.name ?? "");
    const [selected, setSelected] = useState(originalIds);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // The same rules the API enforces, so we can explain them instead of failing on save
    const isOwnRole = role?.id === me.roleId;
    const isStronger = role?.permissions.some(({ permission }) => !me.permissions.includes(permission.name)) ?? false;
    const canEdit = role ? can.update && !isStronger : can.create;
    const canEditPermissions = canEdit && !isOwnRole;

    const nameChanged = name.trim() !== (role?.name ?? "");
    const permissionsChanged = selected.size !== originalIds.size || [...selected].some((id) => !originalIds.has(id));

    function done() {
        queryClient.invalidateQueries({ queryKey: ["roles"] });
        // member lists show role names, so refresh those too
        queryClient.invalidateQueries({ queryKey: ["agents"] });
        onDone();
    }

    const save = useMutation({
        mutationFn: async () => {
            if (!role) {
                await api.post("/roles", { name, permissionIds: [...selected] });
                return;
            }

            // only send what changed: sending permissions for your own role is refused even if unchanged
            await api.patch(`/roles/${role.id}`, {
                ...(nameChanged && { name }),
                ...(permissionsChanged && { permissionIds: [...selected] }),
            });
        },
        onSuccess: () => {
            toast.success(role ? "Role updated" : "Role created");
            done();
        },
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/roles/${role?.id}`),
        onSuccess: () => {
            toast.success("Role deleted");
            done();
        },
    });

    function toggle(id: number) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    }

    // One checkbox of the grid. A plain function (not a component) because it only returns JSX.
    function permissionCheckbox(permissionName: string) {
        const permission = allPermissions.find((p) => p.name === permissionName);
        if (!permission) return null;

        const canGrant = me.permissions.includes(permissionName);

        return (
            <input
                type="checkbox"
                aria-label={permission.description ?? permissionName}
                title={canGrant ? permission.description ?? undefined : "You can only grant permissions you have yourself"}
                checked={selected.has(permission.id)}
                disabled={!canEditPermissions || !canGrant}
                onChange={() => toggle(permission.id)}
                className="size-3.5 accent-accent disabled:opacity-40"
            />
        );
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (role && !nameChanged && !permissionsChanged) return onDone();
                save.mutate();
            }}
        >
            <h2 className="border-b border-line-light px-5 py-4 text-lg font-semibold">
                {role ? role.name : "New role"}
            </h2>

            <div className="space-y-5 px-5 py-4">
                {isStronger && (
                    <p className="rounded-lg bg-app px-3 py-2 text-muted">
                        This role has permissions you don&apos;t have, so you can&apos;t change it.
                    </p>
                )}
                {isOwnRole && !isStronger && (
                    <p className="rounded-lg bg-app px-3 py-2 text-muted">
                        This is your own role. You can rename it, but not change its permissions.
                    </p>
                )}

                <div>
                    <label htmlFor="role-name" className="mb-1 block text-sm font-medium text-muted">
                        Name
                    </label>
                    <input
                        id="role-name"
                        autoFocus={!role}
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!canEdit}
                        placeholder="Sales agent"
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft disabled:bg-paper disabled:text-muted"
                    />
                </div>

                <div>
                    <p className="mb-1 text-sm font-medium text-muted">Permissions</p>
                    <table className="w-full">
                        <thead>
                            <tr className="text-sm text-faint">
                                <th className="py-2 text-left font-medium">Area</th>
                                {ACTIONS.map((action) => (
                                    <th key={action.key} className="w-20 font-medium">
                                        {action.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {AREAS.map((area) => (
                                <tr key={area.key} className="border-t border-line-light">
                                    <td className="py-2">{area.label}</td>
                                    {ACTIONS.map((action) => (
                                        <td key={action.key} className="text-center">
                                            {permissionCheckbox(`${area.key}:${action.key}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                </div>

                {[
                    { title: "See everyone's work", items: SEE_EVERYONES },
                    { title: "Workspace setup", items: SETUP },
                ].map((group) => (
                    <div key={group.title}>
                        <p className="mb-1 text-sm font-medium text-muted">{group.title}</p>
                        <div className="divide-y divide-line-light rounded-lg border border-line-light">
                            {group.items.map((item) => (
                                <label key={item.name} className="flex items-start gap-2.5 px-3 py-2.5">
                                    <span className="pt-0.5">{permissionCheckbox(item.name)}</span>
                                    <span>
                                        <span className="font-medium">{item.label}</span>
                                        <span className="block text-sm text-faint">{item.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}

                {(save.isError || remove.isError) && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(save.error ?? remove.error)}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2 border-t border-line-light px-5 py-3">
                {role && can.delete && !isStronger && (
                    <button
                        type="button"
                        // a role with members can't be deleted (they'd be left without one)
                        disabled={role._count.users > 0 || remove.isPending}
                        title={role._count.users > 0 ? `Move its ${role._count.users} member(s) to another role first` : undefined}
                        onClick={() => (confirmingDelete ? remove.mutate() : setConfirmingDelete(true))}
                        className="h-8 rounded-lg px-3 font-medium text-danger hover:bg-danger-soft disabled:text-light disabled:hover:bg-transparent"
                    >
                        {confirmingDelete ? "Click again to delete" : "Delete role"}
                    </button>
                )}

                <button
                    type="button"
                    onClick={onDone}
                    className="ml-auto h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                >
                    {canEdit ? "Cancel" : "Close"}
                </button>

                {canEdit && (
                    <button
                        type="submit"
                        disabled={save.isPending}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                    >
                        {save.isPending && <Spinner size={14} />}
                        {role ? "Save" : "Create role"}
                    </button>
                )}
            </div>
        </form>
    );
}
