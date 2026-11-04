import { AppShell, Avatar, Button, Logo, Menu, Select, Skeleton, buttonVariants, menuItemClass, navItemClass } from "@gateseeker/ui-kit";
import { ArrowLeft, Bell, BookOpen, ChevronUp, Gauge, History, LayoutDashboard, LogOut, Palette, ScanSearch, Settings, Users } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { useIsAdmin } from "./admin";
import { useAuth } from "./auth-context";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { UpdateBanner } from "./components/UpdateBanner";
import { useNotifications } from "./notifications";
import { Link, navigate } from "./router";
import { rememberWorkspacePath, workspaceBackPath } from "./scan-note";
import { useUpdateNotice } from "./update-notice";

/**
 * The signed-in workspace frame (Figma "Analyze Repository" and "Issues"):
 * header with the logo, the page title and the notifications bell, sidebar
 * with the workspace sections and the account menu (Settings, Sign out) at
 * the bottom. The header carries the Analyze button (also "/" from anywhere),
 * which opens the full-screen analyze view at /app. "Scans" lists every analysis; an opened scan (/r/<id>) keeps
 * that item active and puts a back button to the list before its title,
 * which the page sets with useWorkspaceTitle once the report has loaded.
 * Settings (opened from the account menu) gets a back button to the page
 * it was opened from. Admin masters get a "View as" dropdown at the top of
 * the sidebar that moves between the user workspace and the admin area. The design-system catalogue is product documentation: it uses the
 * frame but has no entry in the sidebar (open /app/design-system directly).
 * While the session is being read (`loading`), the frame renders with
 * skeletons so the page does not jump when it arrives.
 */

export type WorkspacePage = "scans" | "scan" | "dashboard" | "resources" | "settings" | "design-system" | "admin" | "admin-accounts" | "admin-account";

const TITLE: Record<WorkspacePage, string> = { scans: "Scans", scan: "Scan", dashboard: "Dashboard", resources: "Resources", settings: "Settings", "design-system": "Design system", admin: "Admin", "admin-accounts": "Accounts", "admin-account": "Account" };

/** The admin pages show the admin sidebar; the switch reflects the page group and navigates, so a reload lands on "User" unless the address is an admin page. */
const ADMIN_PAGES = new Set<WorkspacePage>(["admin", "admin-accounts", "admin-account"]);

const TitleContext = createContext<(title: string | null) => void>(() => undefined);

/** Replaces the header title while the calling page is mounted (null keeps the default). */
export function useWorkspaceTitle(title: string | null): void {
  const set = useContext(TitleContext);
  useEffect(() => {
    set(title);
    return () => { set(null); };
  }, [set, title]);
}

export function initialsOf(login: string): string {
  return login.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

export function Workspace({ page, loading = false, children }: { page: WorkspacePage; loading?: boolean; children: ReactNode }) {
  const auth = useAuth();
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const login = auth.session?.user.login ?? "";
  const notifications = useNotifications(auth.session?.user.id ?? null);
  const [panel, setPanel] = useState(false);
  const closePanel = useCallback(() => { setPanel(false); }, []);
  const isAdmin = useIsAdmin(auth.session?.user.id ?? null, auth.session?.accessToken ?? null);
  const adminMode = ADMIN_PAGES.has(page);
  const update = useUpdateNotice(auth.session?.user.id ?? null);

  // The analyze view's back button, and the Settings back button, return here.
  useEffect(() => {
    if (page !== "settings") rememberWorkspacePath(window.location.pathname);
  });

  // "/" opens the analyze view from anywhere in the workspace, unless the person is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      navigate("/app");
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, []);

  const account = loading ? (
    <div className="flex items-center gap-2.5 px-4 py-2" aria-hidden="true">
      <Skeleton className="size-8 rounded-full" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  ) : (
    <Menu
      align="start"
      trigger={({ open, toggle, id }) => (
        <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <Avatar initials={initialsOf(login)} />
          <span className="min-w-0 flex-1 truncate text-body font-medium tracking-[-0.04em]">{login ? `@${login}` : "Account"}</span>
          <ChevronUp className={`size-3.5 text-primary transition-transform ${open ? "" : "rotate-180"}`} aria-hidden="true" />
        </button>
      )}
    >
      <Link role="menuitem" href="/app/settings" className={menuItemClass}>
        <Settings aria-hidden="true" /> Settings
      </Link>
      <button role="menuitem" type="button" className={menuItemClass} onClick={() => { void auth.signOut().then(() => { navigate("/"); }); }}>
        <LogOut aria-hidden="true" /> Sign out
      </button>
    </Menu>
  );

  const modeSwitch = isAdmin === true && (
    <div className="grid gap-1 px-3 pb-3">
      <label htmlFor="workspace-view" className="text-label text-muted-foreground">View as</label>
      <Select
        id="workspace-view"
        className="h-9"
        value={adminMode ? "admin" : "user"}
        onChange={(e) => { navigate(e.target.value === "admin" ? "/app/admin" : "/app/dashboard"); }}
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </Select>
    </div>
  );

  const nav = adminMode ? (
    <>
      {modeSwitch}
      <Link href="/app/admin" aria-current={page === "admin" ? "page" : undefined} className={navItemClass(page === "admin")}>
        <Gauge aria-hidden="true" /> Overview
      </Link>
      <Link href="/app/admin/accounts" aria-current={page === "admin-accounts" ? "page" : undefined} className={navItemClass(page === "admin-accounts" || page === "admin-account")}>
        <Users aria-hidden="true" /> Accounts
      </Link>
      <Link href="/app/design-system" aria-current={page === "design-system" ? "page" : undefined} className={navItemClass(page === "design-system")}>
        <Palette aria-hidden="true" /> Design system
      </Link>
    </>
  ) : (
    <>
      {modeSwitch}
      <Link href="/app/dashboard" aria-current={page === "dashboard" ? "page" : undefined} className={navItemClass(page === "dashboard")}>
        <LayoutDashboard aria-hidden="true" /> Dashboard
      </Link>
      <Link href="/app/scans" aria-current={page === "scans" ? "page" : undefined} className={navItemClass(page === "scans" || page === "scan")}>
        <History aria-hidden="true" /> Scans
      </Link>
      <Link href="/app/resources" aria-current={page === "resources" ? "page" : undefined} className={navItemClass(page === "resources")}>
        <BookOpen aria-hidden="true" /> Resources
      </Link>
    </>
  );

  const unread = notifications.unread;
  const actions = loading ? (
    <Skeleton className="size-8" />
  ) : (
    <>
      <Link href="/app" aria-label="Analyze a repository" title="Analyze a repository (/)" className={buttonVariants({ size: "sm" })}>
        <ScanSearch aria-hidden="true" /> <span className="hidden sm:inline">Analyze</span>
      </Link>
      <Button variant="outline" size="icon" className="relative" aria-label={unread > 0 ? `Notifications, ${String(unread)} unread` : "Notifications"} aria-haspopup="dialog" onClick={() => { setPanel(true); }}>
      <Bell className="text-primary" aria-hidden="true" />
      {unread > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-button-stroke bg-destructive px-1 text-micro font-medium text-destructive-foreground not-italic" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </Button>
    </>
  );

  const title =
    page === "scan" ? (
      <span className="flex min-w-0 items-center gap-2">
        <Link href="/app/scans" aria-label="Back to scans" title="Back to scans" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ArrowLeft className="text-primary" aria-hidden="true" />
        </Link>
        <span className="truncate">{customTitle ?? TITLE.scan}</span>
      </span>
    ) : page === "settings" ? (
      <span className="flex min-w-0 items-center gap-2">
        <Link href={workspaceBackPath()} aria-label="Back" title="Back" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ArrowLeft className="text-primary" aria-hidden="true" />
        </Link>
        <span className="truncate">{customTitle ?? TITLE.settings}</span>
      </span>
    ) : (
      customTitle ?? TITLE[page]
    );

  return (
    <TitleContext.Provider value={setCustomTitle}>
    <AppShell brand={<Link href="/app/dashboard" aria-label="GateSeeker workspace" className="flex items-center"><Logo label="GateSeeker" /></Link>} title={title} actions={actions} nav={nav} account={account}>
      {children}
      <NotificationsPanel open={panel} onClose={closePanel} items={notifications.items} onMarkAllRead={notifications.markAllRead} />
      {update.latest && <UpdateBanner version={update.latest} onReload={update.reload} onLater={update.dismiss} />}
    </AppShell>
    </TitleContext.Provider>
  );
}
