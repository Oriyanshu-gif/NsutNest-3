"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Building2, ExternalLink, GraduationCap, Mail, Phone, Users, Search, MapPin, CalendarDays, Filter } from "lucide-react";
import HubShell from "../hub-shell";

const TNP_SITE = "https://www.tnpnsut.in/";
const TNP_CONTACT = "https://www.tnpnsut.in/contact";
const LINKS = [
  { icon: Briefcase, title: "TNP portal", detail: "Official job listings, interview schedules and placement profile.", href: TNP_SITE, cta: "Open portal" },
  { icon: Building2, title: "Recruiters & stats", detail: "Explore the official cell's recruiter information and reports.", href: `${TNP_SITE}recruiters`, cta: "View recruiters" },
  { icon: GraduationCap, title: "Placement policy", detail: "Check eligibility, registration rules and placement guidelines.", href: TNP_SITE, cta: "Read policy" },
  { icon: Users, title: "Alumni network", detail: "Connect with NSUT's Training & Placement community.", href: "https://www.linkedin.com/company/tnp-nsut/", cta: "Follow on LinkedIn" },
] as const;

type RawPlacement = Record<string, unknown>;
type Placement = { id: number; company: string; title: string; type: string; cgpa: number | null; branches: string[]; stipend: number | null; stipendInfo: string; location: string; date: string };
const first = (o: RawPlacement, ...keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return ""; };
const asText = (v: unknown) => Array.isArray(v) ? v.join(", ") : String(v ?? "");
const toPlacement = (o: RawPlacement, id: number): Placement => {
  const cg = Number(first(o, "CGPA", "cgpa"));
  const st = Number(first(o, "Stipend", "stipend"));
  return {
    id,
    company: asText(first(o, "Name", "name", "Company", "company")) || "Company not specified",
    title: asText(first(o, "Title", "title", "Job Title", "jobtitle", "jobTitle")) || "Opportunity details not specified",
    type: asText(first(o, "Type", "type")) || "Opportunity",
    cgpa: Number.isFinite(cg) && cg > 0 ? cg : null,
    branches: (Array.isArray(first(o, "Branches Allowed", "Branches_Allowed", "branchesAllowed", "branches_allowed")) ? first(o, "Branches Allowed", "Branches_Allowed", "branchesAllowed", "branches_allowed") as unknown[] : []).map(String),
    stipend: Number.isFinite(st) && st > 0 ? st : null,
    stipendInfo: asText(first(o, "Stipend Info", "stipend_info", "stipendInfo")),
    location: asText(first(o, "Location", "placeOfPosting", "location")),
    date: asText(first(o, "Arrival Date", "createdAt", "arrivalDate", "date")),
  };
};
const money = (n: number) => n >= 100000 ? `₹${(n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L` : `₹${n.toLocaleString("en-IN")}`;

export default function Tnp() {
  const [records, setRecords] = useState<Placement[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [branch, setBranch] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/data/placements.json")
      .then((r) => { if (!r.ok) throw new Error("Could not load placement data"); return r.json(); })
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error("Placement JSON must contain an array");
        setRecords(data.map((item, i) => toPlacement(item as RawPlacement, i)));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const branches = useMemo(() => Array.from(new Set(records.flatMap((r) => r.branches).filter((b) => b && b.toUpperCase() !== "ALL"))).sort(), [records]);
  const types = useMemo(() => ["All", ...Array.from(new Set(records.map((r) => r.type))).sort()], [records]);
  const filtered = useMemo(() => records.filter((r) => {
    const haystack = [r.company, r.title, r.type, r.location, r.stipendInfo, r.date, ...r.branches].join(" ").toLowerCase();
    const matchesQuery = haystack.includes(query.trim().toLowerCase());
    const matchesType = type === "All" || r.type.toLowerCase() === type.toLowerCase();
    const matchesBranch = branch === "All" || r.branches.some((b) => b.toUpperCase() === "ALL" || b.toLowerCase() === branch.toLowerCase());
    return matchesQuery && matchesType && matchesBranch;
  }), [records, query, type, branch]);

  return (
    <HubShell>
      <main className="tnpShell">
        <header className="tnpHeader">
          <div>
            <small className="panelKicker">CAREER OPPORTUNITIES</small>
            <h1>Training &amp; Placement</h1>
            <p>Browse placement and internship opportunities from the supplied placement dataset, alongside official NSUT T&amp;P links.</p>
          </div>
          <span className="tnpSync">{records.length ? `${records.length} dataset entries` : "Placement data"}</span>
        </header>

        <section className="tnpLinkGrid">
          {LINKS.map(({ icon: Icon, title, detail, href, cta }) => (
            <a className="hubCard tnpCard" key={title} href={href} target="_blank" rel="noreferrer noopener">
              <span className="tnpCardIcon"><Icon size={20} /></span><h3>{title}</h3><p>{detail}</p>
              <span className="tnpCardCta">{cta} <ExternalLink size={12} /></span>
            </a>
          ))}
        </section>

        <section className="hubCard tnpOpportunities">
          <div className="tnpOpportunityHead">
            <div><div className="panelKicker">PLACEMENT DATASET</div><h2>Placements &amp; internships</h2><p>Search by company, role, branch, location or eligibility details.</p></div>
            <span className="tnpResultCount">{loading ? "Loading…" : `${filtered.length} results`}</span>
          </div>
          <div className="tnpFilters">
            <label className="tnpSearch"><Search size={17}/><input aria-label="Search placements" placeholder="Search companies, roles, locations…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <label className="tnpSelectLabel"><Filter size={15}/><select aria-label="Filter by opportunity type" value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t} value={t}>{t === "All" ? "All types" : t}</option>)}</select></label>
            <label className="tnpSelectLabel"><GraduationCap size={15}/><select aria-label="Filter by branch" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="All">All branches</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
          </div>
          {loadError && <p className="tnpLoadError">Could not load the placement JSON. Make sure <code>placements.json</code> is present in <code>public/data/</code>.</p>}
          {!loadError && !loading && filtered.length === 0 && <div className="tnpNoResults">No opportunities match these filters. Try another search or choose “All”.</div>}
          <div className="tnpOpportunityList">
            {filtered.slice(0, 100).map((p) => (
              <article className="tnpOpportunity" key={p.id}>
                <div className="tnpOpportunityMain">
                  <div className="tnpCompanyLine"><h3>{p.company}</h3><span className={`tnpType ${p.type.toLowerCase().includes("intern") ? "internship" : "placement"}`}>{p.type}</span></div>
                  <p className="tnpRole">{p.title}</p>
                  <div className="tnpMeta">
                    {p.location && <span><MapPin size={13}/>{p.location}</span>}
                    {p.date && <span><CalendarDays size={13}/>{p.date}</span>}
                    {p.cgpa !== null && <span><GraduationCap size={13}/>Min CGPA: {p.cgpa}</span>}
                  </div>
                  {p.branches.length > 0 && <p className="tnpBranches"><b>Eligible branches:</b> {p.branches.includes("ALL") ? "All branches (as listed)" : p.branches.join(", ")}</p>}
                  {p.stipendInfo && <p className="tnpStipendInfo">{p.stipendInfo}</p>}
                </div>
                {p.stipend !== null && <div className="tnpPay"><small>{p.type.toLowerCase().includes("intern") ? "Listed stipend / amount" : "Listed package / amount"}</small><b>{money(p.stipend)}</b></div>}
              </article>
            ))}
          </div>
          {!loading && filtered.length > 100 && <p className="tnpLimitNote">Showing the first 100 of {filtered.length} matching entries. Use search and filters to narrow the list.</p>}
          <p className="tnpDatasetNote">Dataset entries are shown as supplied and may include historical, incomplete or differently formatted records. Verify eligibility, dates and compensation with the official T&amp;P portal before acting.</p>
        </section>

        <section className="hubCard tnpContact">
          <div className="panelKicker">REACH THE CELL</div><h2>Contact the Training &amp; Placement cell</h2>
          <p>Confirm current openings, eligibility and official placement information with NSUT’s Training &amp; Placement Cell.</p>
          <div className="tnpContactRows">
            <a href="mailto:placements@nsut.ac.in"><Mail size={15} /> placements@nsut.ac.in</a>
            <a href="mailto:placements@nsitonline.in"><Mail size={15} /> placements@nsitonline.in</a>
            <a href="tel:+919205475078"><Phone size={15} /> +91-92054-75078</a>
            <a href="tel:+919810472670"><Phone size={15} /> +91-98104-72670</a>
          </div>
          <a className="tnpContactLink" href={TNP_CONTACT} target="_blank" rel="noreferrer noopener">Full contact list on tnpnsut.in <ExternalLink size={13} /></a>
        </section>
        <footer className="hubFooter"><p>NSUT Nest · unofficial student project</p><small>Placement dataset is community-provided; always verify details with official sources.</small></footer>
      </main>
    </HubShell>
  );
}
