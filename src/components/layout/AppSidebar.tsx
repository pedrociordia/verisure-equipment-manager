import {
  LayoutDashboard, Users, ClipboardList, History, BarChart3, Settings, LogOut, Shield,
  Wallet,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import verisureLogo from '@/assets/verisure-logo-white.png';
import verisureIsotipo from '@/assets/verisure-isotipo-white.png';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const mainNav = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, roles: ['admin', 'data_manager', 'sbc'] },
  { title: 'People', url: '/people', icon: Users, roles: ['admin', 'data_manager'] },
  { title: 'New Transaction', url: '/transaction/new', icon: ClipboardList, roles: ['admin', 'sbc'] },
  { title: 'Transaction History', url: '/transactions', icon: History, roles: ['admin', 'data_manager', 'sbc'] },
  { title: 'Reports', url: '/reports', icon: BarChart3, roles: ['admin', 'data_manager'] },
  { title: 'Debt Follow-up', url: '/debt-followup', icon: Wallet, roles: ['admin', 'data_manager'] },
  { title: 'Settings', url: '/settings', icon: Settings, roles: ['admin'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { role, profile, signOut } = useAuth();

  const filteredNav = mainNav.filter(item => role && item.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          {collapsed ? (
            <img src={verisureIsotipo} alt="Verisure" className="h-7 w-auto" />
          ) : (
            <>
              <img src={verisureLogo} alt="Verisure" className="h-7 w-auto" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">
                  Equipment Manager
                </span>
              </div>
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && (
          <div className="mb-3 space-y-1">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.full_name || profile?.email}
            </p>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-sidebar-primary" />
              <span className="text-xs text-sidebar-foreground/70 capitalize">
                {role?.replace('_', ' ')}
              </span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={signOut}
          className="w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
