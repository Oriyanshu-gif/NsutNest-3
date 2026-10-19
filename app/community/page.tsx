"use client";

/**
 * Community — a light hub page listing the campus spaces that the community
 * pulse number on the Overview stands for. The Overview links here; the page
 * reuses the HUB shell so the sidebar stays consistent.
 *
 * The fest section carries real information about NSUT's fests: Moksha (the
 * annual inter-college cultural festival, running since 2003) and Resonanz
 * (the intra-college cultural fest), with photographs from Junoon, NSUT's
 * official photography club — credited and linked to their collections page.
 */

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Coffee, ExternalLink, MessageCircle, Sparkles, Users } from "lucide-react";

const SITE = "https://www.junoonnsut.com";
const REDDIT = "https://www.reddit.com/r/NSUT_Delhi/";
const HANGOUT_SUBMISSION = "https://www.reddit.com/r/NSUT_Delhi/submit?title=Hangout%20recommendation&text=Spot%20name%3A%0AArea%20%2F%20gate%3A%0AWhy%20is%20it%20worth%20visiting%3F";

// Photos are loaded straight from Junoon's own site CDN; each card links back
// to the collection it came from.
const GALLERY = [
  {
    title: "Moksha — Day 3 (2025)",
    collection: `${SITE}/collections`,
    // Cover photo of the Moksha Day 3 collection.
    img: "https://cdn.sanity.io/images/tvwtacpm/production/4f2c4b497665103b0a313248c1f113584cc41c71-5488x3659.jpg?auto=format&w=1200&q=70",
  },
  {
    title: "Moksha — Day 2 (2025)",
    collection: `${SITE}/collections`,
    img: "https://cdn.sanity.io/images/tvwtacpm/production/d962570207a6aadddfe1657503f4f96135290f46-5112x3408.jpg?auto=format&w=1200&q=70",
  },
  {
    title: "Innovision — Day 1 (2025)",
    collection: `${SITE}/collections`,
    img: "https://cdn.sanity.io/images/tvwtacpm/production/643e02cda2142e20a86065b79a9c3070a5ac80b1-3930x4912.jpg?auto=format&w=1200&q=70",
  },
];

export default function Community() {
  return (
    <div className="communityShell">
      <Link href="/" className="communityBackLink"><ArrowLeft size={15} /> Back to dashboard</Link>
      <header className="communityHeader">
        <div>
          <span className="communityEyebrow">THE STUDENT INTERNET</span>
          <h1>Community <Sparkles size={19} aria-hidden="true" /></h1>
          <p>What NSUT is talking about right now.</p>
        </div>
        <a className="communityOpenLink" href={REDDIT} target="_blank" rel="noreferrer noopener">
          <ExternalLink size={13} /> Open r/NSUT_Delhi
        </a>
      </header>

      <div className="communityFeatureGrid">
        <section className="communityFeed hubCard" aria-label="NSUT community spaces">
          <div className="communityFeedHead">
            <span className="communityRedditMark"><MessageCircle size={15} /></span>
            <div><b>r/NSUT_Delhi</b><small>Student discussions on Reddit</small></div>
            <a href={REDDIT} target="_blank" rel="noreferrer noopener">Visit <ArrowUpRight size={12} /></a>
          </div>
          <a className="communityFeedRow" href={REDDIT} target="_blank" rel="noreferrer noopener">
            <span className="communityTopic">DISCUSSIONS</span>
            <b>Everyday campus conversations</b>
            <small>Questions, campus updates, and student-to-student discussions.</small>
            <ArrowUpRight size={15} />
          </a>
          <a className="communityFeedRow" href="https://mokshansut.com/" target="_blank" rel="noreferrer noopener">
            <span className="communityTopic">FESTS</span>
            <b>Moksha and campus events</b>
            <small>Explore NSUT&apos;s cultural fest and event updates.</small>
            <ArrowUpRight size={15} />
          </a>
          <a className="communityFeedRow" href={SITE} target="_blank" rel="noreferrer noopener">
            <span className="communityTopic">CAMPUS LIFE</span>
            <b>Moments captured by Junoon</b>
            <small>Browse fest and campus photography by NSUT&apos;s photo club.</small>
            <ArrowUpRight size={15} />
          </a>
        </section>

        <aside className="communityEnergy hubCard">
          <Coffee size={19} />
          <h2>Campus energy</h2>
          <p>Find your next study break, chai stop, or society conversation.</p>
          <a href="#fest-info">Explore campus <ArrowUpRight size={13} /></a>
        </aside>
      </div>

      {/* ---- Fest info, sourced from NSUT's official pages and press coverage ---- */}
      <section className="communityDetails hubCard" id="fest-info">
        <div className="communityDetailsIntro">
          <div className="panelKicker">MAKE CAMPUS BETTER</div>
          <h2>Find your people, places, and fests</h2>
          <p>Explore what makes campus life at NSUT more than the marks sheet.</p>
        </div>
        <a className="communityRecommend" href={HANGOUT_SUBMISSION} target="_blank" rel="noreferrer noopener">
          <span><b>Recommend a hangout</b><small>Share a campus spot with the community on Reddit.</small></span>
          <span className="blueButton">Share recommendation <ArrowUpRight size={13} /></span>
        </a>
        <div className="communityFestInfo">
          <div className="panelKicker">FEST SEASON</div>
          <h3>Moksha — NSUT&apos;s flagship fest</h3>
          <p>
            Moksha is the annual inter-college cultural festival of Netaji Subhas University of
            Technology, running every year since 2003 and held in March — typically a three-day
            spectacle of music, dance, art, fashion and comedy that draws student performers from
            colleges across India. Recent editions brought Sunidhi Chauhan, King and Raftaar to
            campus, and past lineups have featured KK, Divine, Ritviz, Nucleya, Mohit Chauhan,
            Kailash Kher and Edward Maya. Alongside it, <b>Resonanz</b> (the intra-college cultural
            fest) and <b>Innovision</b> (the technical fest) keep the campus buzzing through the year.
          </p>
          <div className="festFacts">
            <div><b>2003</b><small>running since</small></div>
            <div><b>3 days</b><small>of events every March</small></div>
            <div><b>Major artists</b><small>Sunidhi, King, Raftaar, KK, Divine…</small></div>
          </div>
          <div className="festLinks">
            <a className="blueButton" href="https://mokshansut.com/" target="_blank" rel="noreferrer noopener">
              Moksha site <ArrowUpRight size={13} />
            </a>
            <a className="festGhostLink" href="https://nsut.ac.in" target="_blank" rel="noreferrer noopener">
              nsut.ac.in <ArrowUpRight size={12} />
            </a>
          </div>
        </div>
      </section>

      {/* ---- Photo gallery from Junoon, credited ---- */}
      <section className="festGallery" id="fest-gallery">
        <div className="hubCardHead festGalleryHead">
          <div>
            <span className="panelKicker">FEST GALLERY</span>
            <h2>Photos by Junoon</h2>
          </div>
        </div>
        <div className="hangoutGrid">
          {GALLERY.map((g) => (
            <a className="hangoutCard" key={g.title} href={g.collection} target="_blank" rel="noreferrer noopener">
              <div className="hangoutImg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.img} alt={g.title} loading="lazy" />
              </div>
              <div className="hangoutMeta">
                <div className="hangoutName">
                  <h3>{g.title}</h3>
                  <p>Junoon · NSUT</p>
                </div>
                <span className="hangoutRating"><ArrowUpRight size={12} /></span>
              </div>
            </a>
          ))}
        </div>
        <p className="junoonCredit">
          Photos courtesy <a href={SITE} target="_blank" rel="noreferrer noopener">Junoon, NSUT</a> —{" "}
          <a href={`${SITE}/collections`} target="_blank" rel="noreferrer noopener">junoonnsut.com/collections</a>.
          All rights with the photographers.
        </p>
      </section>

      <div className="communityBanner hubCard">
        <MessageCircle size={22} />
        <div>
          <h3>Join the NSUT subreddit</h3>
          <p>Ask questions, share campus updates and connect with students on r/NSUT_Delhi.</p>
        </div>
        <a href={REDDIT} target="_blank" rel="noreferrer noopener" className="blueButton">Visit subreddit <ArrowUpRight size={13} /></a>
      </div>
    </div>
  );
}
