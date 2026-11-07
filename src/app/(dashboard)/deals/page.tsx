import DealsView from './DealsView'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/auth/requirePermission'

const DealPage = async () => {
    const user = await getCurrentUser()

    if (!user) {
        redirect("/login");
    }
    const can = (permission: string) => hasPermission(user, permission)
    return (
        <DealsView
            meId={user.id}
            can={{
                create: can("deal:create"),
                update: can("deal:update"),
                delete: can("deal:delete"),
                read: can("deal:read"),
                assign: can("deal:update") && can("deal:all"),
                seeAgents: can("user:read"),
                readLeads: can("lead:read"),
                managePipeline: can("pipeline:manage"),
                manageCustomFields: can("custom-fields:manage"),
                manageProducts: can("workspace:manage"),
            }}
        />
    );
}

export default DealPage