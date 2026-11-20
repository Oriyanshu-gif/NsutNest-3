"use client";

/**
 * Shared application shell (web + installed PWA).
 *
 * Desktop keeps the fixed sidebar; phones get a five-slot bottom bar (Dashboard,
 * Notices, Study Material, Results, More). The top bar is deliberately thin, hides while
 * scrolling down on a phone and returns on scroll up. Pulling down at the top of
 * the page asks the IMS gate for a refresh, exactly like the attendance button.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDown,
  Bell,
  BookOpen,
  Briefcase,
  Download,
  Home,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import BrandLogo from "./brand-logo";
import { InstallBanner } from "./install-pwa";
import {
  ATTENDANCE_REFRESH_STATUS_EVENT,
  ATTENDANCE_SYNC_EVENT,
  PROFILE_SYNC_EVENT,
  readStoredAttendance,
  readStoredProfile,
  requestAttendanceRefresh,
  type StoredImsProfile,
} from "../lib/app-storage";
import { loadStudents } from "../lib/data";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Dashboard", icon: Home },
  { href: "/notices", label: "Notices", short: "Notices", icon: Bell },
  { href: "/study-material", label: "Study material", short: "Study Material", icon: BookOpen },
  { href: "/results", label: "Results", short: "Results", icon: Trophy },
  { href: "/tnp", label: "TNP", short: "TNP", icon: Briefcase },
  { href: "/community", label: "Community", short: "Social", icon: Users },
];

const MOBILE_NAV = NAV.filter((item) => ["/", "/notices", "/study-material", "/results"].includes(item.href));

const SIDEBAR_STORAGE_KEY = "nsutnest_sidebar_collapsed";
const INSTALL_EVENT = "nsutnest-install-request";

type LiveAttendance = { name: string; roll: string };
/** One automatic profile fetch per signed-in roll, per page session. */
const profileFetchAttempts = new Set<string>();

function crumb(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/notices")) return "Notices";
  if (pathname.startsWith("/study-material")) return "Study material";
  if (pathname.startsWith("/tnp")) return "TNP (Training & Placement)";
  if (pathname.startsWith("/results")) return "Results";
  if (pathname.startsWith("/community")) return "Community";
  if (pathname.startsWith("/profile")) return "My Profile";
  if (pathname.startsWith("/student")) return "Student profile";
  return pathname;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function HubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const activeLabel = crumb(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loggedInStudent, setLoggedInStudent] = useState<LiveAttendance | null>(null);
  const [profile, setProfile] = useState<StoredImsProfile | null>(null);
  const [profileSyncToken, setProfileSyncToken] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const pullRef = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  useEffect(() => {
    function syncStudent() {
      const cached = readStoredAttendance();
      if (!cached) {
        setLoggedInStudent(null);
        return;
      }
      try {
        const parsed = JSON.parse(cached) as Partial<LiveAttendance>;
        if (typeof parsed.name === "string" && typeof parsed.roll === "string") {
          const roll = parsed.roll.trim();
          setLoggedInStudent({ name: parsed.name.trim(), roll });
          void loadStudents()
            .then((students) => {
              const current = readStoredAttendance();
              if (!current) return;
              const currentAttendance = JSON.parse(current) as Partial<LiveAttendance>;
              if (currentAttendance.roll?.trim().toUpperCase() !== roll.toUpperCase()) return;
              const student = students.find((record) => record.roll.trim().toUpperCase() === roll.toUpperCase());
              if (student) setLoggedInStudent({ name: student.name, roll });
            })
            .catch((error) => {
              console.error("Could not resolve the signed-in student from published results.", error);
            });
          return;
        }
        setLoggedInStudent(null);
      } catch (error) {
        console.error("Could not read the saved IMS student identity.", error);
        setLoggedInStudent(null);
      }
    }

    syncStudent();
    window.addEventListener(ATTENDANCE_SYNC_EVENT, syncStudent);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, syncStudent);
  }, []);

  useEffect(() => {
    function syncProfile() {
      try {
        const raw = readStoredProfile();
        const parsed = raw ? (JSON.parse(raw) as StoredImsProfile) : null;
        const sameStudent =
          !parsed?.roll ||
          !loggedInStudent?.roll ||
          parsed.roll.toUpperCase() === loggedInStudent.roll.toUpperCase();
        setProfile(sameStudent && parsed?.fields?.length ? parsed : null);
      } catch {
        setProfile(null);
      }
    }

    syncProfile();
    window.addEventListener(PROFILE_SYNC_EVENT, syncProfile);
    return () => window.removeEventListener(PROFILE_SYNC_EVENT, syncProfile);
  }, [loggedInStudent?.roll]);

  useEffect(() => {
    const onAttendanceSync = () => {
      profileFetchAttempts.clear();
      setProfileSyncToken((token) => token + 1);
    };
    window.addEventListener(ATTENDANCE_SYNC_EVENT, onAttendanceSync);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, onAttendanceSync);
  }, []);

  useEffect(() => {
    if (!loggedInStudent?.roll || pathname === "/profile") return;
    if (readStoredProfile()) return;
    const key = loggedInStudent.roll.toUpperCase();
    if (profileFetchAttempts.has(key)) return;
    profileFetchAttempts.add(key);

    fetch("/api/ims/profile", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as StoredImsProfile & { error?: string };
        if (!response.ok) throw new Error(body.error || "Profile unavailable");
        return body;
      })
      .then((payload) => {
        if (!payload?.fields?.length) return;
        window.localStorage.setItem("nsutnest_ims_profile", JSON.stringify(payload));
        window.dispatchEvent(new Event(PROFILE_SYNC_EVENT));
      })
      .catch(() => {
        // Initials remain in the sidebar; the profile page reports the reason.
      });
  }, [loggedInStudent?.roll, pathname, profileSyncToken]);

  // Hide the compact top bar while scrolling down, bring it back on scroll up.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 40) setTopbarHidden(false);
      else if (y > lastY + 6) setTopbarHidden(true);
      else if (y < lastY - 6) setTopbarHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The gate owns the CAPTCHA session, so the shell only announces when a
  // refresh starts and ends; the pull indicator mirrors that status.
  useEffect(() => {
    const onStatus = (event: Event) => setRefreshing(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Pull-to-refresh: only when the page is already at the top, damping the
  // gesture so the browser's own overscroll does not fight it.
  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;
    let startY = 0;
    let tracking = false;

    function reset() {
      pullRef.current = 0;
      setPull(0);
    }

    function onStart(event: TouchEvent) {
      if (window.scrollY > 0 || event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      tracking = true;
    }

    function onMove(event: TouchEvent) {
      if (!tracking) return;
      const delta = event.touches[0].clientY - startY;
      if (delta <= 0 || window.scrollY > 0) {
        reset();
        return;
      }
      const damped = Math.min(84, delta * 0.45);
      pullRef.current = damped;
      setPull(damped);
      if (damped > 10 && event.cancelable) event.preventDefault();
    }

    function onEnd() {
      if (!tracking) return;
      tracking = false;
      if (pullRef.current > 56) {
        requestAttendanceRefresh();
        try {
          navigator.vibrate?.(8);
        } catch {
          // Haptics are optional and not supported everywhere.
        }
      }
      reset();
    }

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onEnd);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Storage is optional; the rail simply starts expanded next visit.
      }
      return next;
    });
  }

  function openInstall() {
    window.dispatchEvent(new Event(INSTALL_EVENT));
  }

  const studentName =
    loggedInStudent?.name?.trim() || profile?.name?.trim() || loggedInStudent?.roll || "Student";
  const nameParts = studentName.split(/\s+/).filter(Boolean);
  const studentInitials =
    nameParts.length > 1
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
      : (nameParts[0]?.[0] ?? "S").toUpperCase();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className={`hub ${collapsed ? "hubCollapsed" : ""}`}>
      <aside className="hubSidebar">
        <div className="hubSidebarTop">
          <Link href="/" className="hubBrand" aria-label="NSUT Nest dashboard">
            <BrandLogo />
          </Link>
          <button
            className="hubNavToggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <nav className="hubNav" aria-label="Main navigation">
          <div className="hubNavLabel">Workspace</div>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`hubNavItem ${isActive(href) ? "active" : ""}`}
              aria-current={isActive(href) ? "page" : undefined}
              title={collapsed ? label : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              <span className="hubNavText">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="hubSidebarFooter">
          <button className="hubNavItem hubInstallItem" type="button" onClick={openInstall}>
            <Download size={18} aria-hidden="true" />
            <span className="hubNavText">Install app</span>
          </button>
          <Link
            href="/profile"
            className="hubUser hubUserLink"
            title={`Open ${studentName}'s My Profile`}
          >
            <span className="hubUserAvatar">
              {profile?.photo ? <img src={profile.photo} alt="" /> : studentInitials}
            </span>
            <span className="hubUserIdentity">
              <b title={studentName}>{studentName}</b>
              <small>{loggedInStudent ? `Roll ${loggedInStudent.roll}` : "Not signed in to IMS"}</small>
            </span>
          </Link>
        </div>
      </aside>

      <nav className="mobileBottomNav" aria-label="Mobile navigation">
        {MOBILE_NAV.map(({ href, label, short, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            aria-label={label}
            className={`mobileBottomNavItem ${isActive(href) ? "active" : ""}`}
          >
            <span className="mobileTabIcon">
              <Icon size={21} strokeWidth={isActive(href) ? 2.4 : 1.8} aria-hidden="true" />
            </span>
            <span>{short}</span>
          </Link>
        ))}
        <button
          className={`mobileBottomNavItem ${moreOpen ? "active" : ""}`}
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-label="More destinations"
        >
          <span className="mobileTabIcon">
            <MoreHorizontal size={21} aria-hidden="true" />
          </span>
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="moreSheetBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <section className="moreSheet" role="dialog" aria-modal="true" aria-labelledby="moreSheetTitle">
            <div className="moreSheetHandle" aria-hidden="true" />
            <div className="moreSheetHead">
              <h2 id="moreSheetTitle">More</h2>
              <button
                className="moreSheetClose"
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                ref={closeRef}
              >
                <X size={18} />
              </button>
            </div>

            <div className="moreSheetGrid">
              <Link className="moreSheetLink" href="/tnp" onClick={() => setMoreOpen(false)}>
                <span className="moreSheetIcon"><Briefcase size={18} /></span>
                <span><b>TNP</b><small>Training &amp; Placement</small></span>
              </Link>
              <Link className="moreSheetLink" href="/community" onClick={() => setMoreOpen(false)}>
                <span className="moreSheetIcon"><Users size={18} /></span>
                <span><b>Community</b><small>Campus life and scenes</small></span>
              </Link>
            </div>

            <div className="moreSheetSection">
              <small className="moreSheetSectionLabel">Settings</small>
              <button className="moreSheetLink" type="button" onClick={() => { setMoreOpen(false); openInstall(); }}>
                <span className="moreSheetIcon"><Download size={18} /></span>
                <span><b>Install app</b><small>Add NSUT Nest to your home screen</small></span>
              </button>
              <button
                className="moreSheetLink"
                type="button"
                onClick={() => { setMoreOpen(false); requestAttendanceRefresh(); }}
              >
                <span className="moreSheetIcon"><RefreshCw size={18} /></span>
                <span><b>Refresh attendance</b><small>Sign in to NSUT IMS again</small></span>
              </button>
              <Link className="moreSheetLink" href="/profile" onClick={() => setMoreOpen(false)}>
                <span className="moreSheetIcon"><Home size={18} /></span>
                <span><b>My profile</b><small>IMS details and saved photograph</small></span>
              </Link>
            </div>
          </section>
        </div>
      )}

      <div className="hubMain">
        <div
          className={`pullIndicator ${pull > 56 ? "armed" : ""} ${refreshing ? "busy" : ""}`}
          style={{ transform: `translateY(${Math.min(pull, 64)}px)`, opacity: pull || refreshing ? 1 : 0 } as CSSProperties}
          aria-live="polite"
          aria-hidden={!pull && !refreshing}
        >
          {refreshing ? <Loader2 size={15} className="attSpinIcon" /> : <ArrowDown size={15} />}
          <span>{refreshing ? "Refreshing attendance…" : pull > 56 ? "Release to refresh" : "Pull to refresh"}</span>
        </div>

        <header className={`hubTopbar ${topbarHidden ? "is-hidden" : ""}`}>
          <div className="hubBreadcrumb">
            <span>NSUT</span>
            <span className="crumbSlash">/</span>
            <b>{activeLabel}</b>
          </div>
          <div className="hubTopbarRight">
            <Link href="/profile" className="hubTopbarProfile" aria-label="Open My Profile">
              {profile?.photo ? <img src={profile.photo} alt="" /> : <span>{studentInitials}</span>}
            </Link>
            <Link
              href="/notices"
              className="hubBell"
              aria-label="Notices"
            >
              <Bell size={17} aria-hidden="true" />
            </Link>
            <span className={`hubSemester ${loggedInStudent ? "connected" : "idle"}`}>
              <i className="hubSemesterDot" /> {loggedInStudent ? "IMS synced" : "IMS not connected"}
            </span>
          </div>
        </header>

        <main className="hubContent" ref={mainRef}>
          <InstallBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
