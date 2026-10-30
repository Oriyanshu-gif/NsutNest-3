"use client";

import { Briefcase, Building2, ExternalLink, GraduationCap, Mail, Phone, Users } from "lucide-react";
import HubShell from "../hub-shell";

const TNP_SITE = "https://www.tnpnsut.in/";
const TNP_CONTACT = "https://www.tnpnsut.in/contact";
const LINKS = [
  { icon: Briefcase, title: "TNP portal", detail: "Official job listings, interview schedules and placement profile.", href: TNP_SITE, cta: "Open portal" },
  { icon: Building2, title: "Recruiters & stats", detail: "Explore the official cell's recruiter information and reports.", href: `${TNP_SITE}recruiters`, cta: "View recruiters" },
  { icon: GraduationCap, title: "Placement policy", detail: "Check eligibility, registration rules and placement guidelines.", href: TNP_SITE, cta: "Read policy" },
  { icon: Users, title: "Alumni network", detail: "Connect with NSUT's Training & Placement community.", href: "https://www.linkedin.com/company/tnp-nsut/", cta: "Follow on LinkedIn" },
] as const;

export default function Tnp() {
  return (
    <HubShell>
      <main className="tnpShell">
        <header className="tnpHeader">
          <div>
            <small className="panelKicker">CAREER OPPORTUNITIES</small>
            <h1>Training &amp; Placement</h1>
            <p>Official NSUT T&amp;P links, contacts and the upcoming placement board — all in one place.</p>
          </div>
          <span className="tnpSync">Coming soon</span>
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
            <div><div className="panelKicker">PLACEMENT DATASET</div><h2>Placements &amp; internships</h2><p>Company, role, stipend and eligibility listings return here shortly.</p></div>
            <span className="tnpResultCount">Coming soon</span>
          </div>

          <div className="tnpSoon">
            <img className="tnpSoonImg" src="/campus-map.png" alt="" aria-hidden="true" />
            <div className="tnpSoonScrim" />
            <div className="tnpSoonBody">
              <span className="tnpSoonBadge">Coming soon</span>
              <h3>The placement board is being rebuilt</h3>
              <p>Company, role, stipend and eligibility listings will show up here shortly. Meanwhile, grab the official openings straight from the T&amp;P portal.</p>
              <a className="tnpSoonCta" href={TNP_SITE} target="_blank" rel="noreferrer noopener">Visit tnpnsut.in <ExternalLink size={13} /></a>
            </div>
          </div>

          <p className="tnpDatasetNote">Official listings live on the T&amp;P portal — verify eligibility, dates and compensation there before acting.</p>
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
        <footer className="hubFooter"><p>NSUT Nest · unofficial student project</p><small>Always verify placement details with official NSUT sources.</small></footer>
      </main>
    </HubShell>
  );
}
