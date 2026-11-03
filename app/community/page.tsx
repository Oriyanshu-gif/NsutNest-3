"use client";

/**
 * Community — the campus social tab.
 *
 * Three things a student actually needs from a "community" page, and nothing
 * invented: a way to say what they are into and find the threads about it, a
 * composer that opens a real r/NSUT_Delhi submission with the right template
 * prefilled, and the real campus context (fests, the Junoon gallery, the map).
 *
 * No fabricated post counts, members or ratings: every number here is a stated
 * fact (Moksha has run since 2003) and every link goes to the real source.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  Code2,
  Compass,
  Cpu,
  ExternalLink,
  Flame,
  Map,
  MessageCircle,
  MessagesSquare,
  Mic,
  Music2,
  Palette,
  PenLine,
  Rocket,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import HubShell from "../hub-shell";

const SUBREDDIT = "https://www.reddit.com/r/NSUT_Delhi/";
const NEW_THREADS = `${SUBREDDIT}new/`;
const TOP_WEEK = `${SUBREDDIT}top/?t=week`;
const SUBMIT = `${SUBREDDIT}submit`;
const JUNOON = "https://www.junoonnsut.com";
const MOKSHA = "https://mokshansut.com/";

/** Scenes, not societies: names of clubs change, the interests do not. */
const SCENES = [
  { id: "code", label: "Coding & dev", blurb: "Hackathons, DSA grind, side projects.", icon: Code2, q: "coding" },
  { id: "robotics", label: "Robotics & hardware", blurb: "Bots, drones, embedded builds.", icon: Cpu, q: "robotics" },
  { id: "photo", label: "Photography", blurb: "Campus frames and fest shoots.", icon: Camera, q: "photography" },
  { id: "music", label: "Music", blurb: "Jam rooms, gigs, playback.", icon: Music2, q: "music" },
  { id: "stage", label: "Drama & improv", blurb: "Street plays, theatre, open mics.", icon: Mic, q: "drama" },
  { id: "debate", label: "Debate & MUN", blurb: "Parli, MUNs, public speaking.", icon: MessagesSquare, q: "MUN" },
  { id: "startup", label: "Startups", blurb: "Pitches, founders, E-cell energy.", icon: Rocket, q: "startup" },
  { id: "design", label: "Design & film", blurb: "Posters, edits, short films.", icon: Palette, q: "design" },
  { id: "sports", label: "Sports", blurb: "Turf time, teams, tournaments.", icon: Trophy, q: "sports" },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

const POST_KINDS = [
  {
    id: "question",
    label: "Ask a question",
    prefix: "",
    body: "",
    placeholder: "e.g. Which elective is actually worth taking in sem 5?",
  },
  {
    id: "hangout",
    label: "Recommend a spot",
    prefix: "Hangout: ",
    body: "Spot name:\nWhere on or around campus:\nWhy it's worth visiting:\n",
    placeholder: "e.g. The chai stall behind the library",
  },
  {
    id: "people",
    label: "Find your people",
    prefix: "Looking for people: ",
    body: "What:\nWhen:\nWhere:\nWho's in:\n",
    placeholder: "e.g. Anyone up for a Sunday football game?",
  },
] as const;

type PostKind = (typeof POST_KINDS)[number]["id"];

const GALLERY = [
  {
    title: "Moksha — Day 3",
    year: "2025",
    img: "https://cdn.sanity.io/images/tvwtacpm/production/4f2c4b497665103b0a313248c1f113584cc41c71-5488x3659.jpg?auto=format&w=1400&q=70",
  },
  {
    title: "Moksha — Day 2",
    year: "2025",
    img: "https://cdn.sanity.io/images/tvwtacpm/production/d962570207a6aadddfe1657503f4f96135290f46-5112x3408.jpg?auto=format&w=1000&q=70",
  },
  {
    title: "Innovision — Day 1",
    year: "2025",
    img: "https://cdn.sanity.io/images/tvwtacpm/production/643e02cda2142e20a86065b79a9c3070a5ac80b1-3930x4912.jpg?auto=format&w=1000&q=70",
  },
];

const SCENES_KEY = "nsutnest.community.scenes";
const TITLE_LIMIT = 300;

function sceneThreads(query: string): string {
  return `${SUBREDDIT}search/?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new`;
}

/** Pinned scenes survive reloads; storage failures degrade to session-only. */
function readPinned(): SceneId[] {
  try {
    const raw = window.localStorage.getItem(SCENES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = SCENES.map((scene) => scene.id as string);
    return parsed.filter((id): id is SceneId => typeof id === "string" && valid.includes(id));
  } catch {
    return [];
  }
}

function writePinned(ids: SceneId[]) {
  try {
    window.localStorage.setItem(SCENES_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or blocked storage: the picks still work for this visit.
  }
}

export default function Community() {
  const [pinned, setPinned] = useState<SceneId[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [kind, setKind] = useState<PostKind>("question");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setPinned(readPinned());
  }, []);

  // Escape closes the map, and the page behind it must not scroll away.
  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapOpen]);

  function toggleScene(id: SceneId) {
    setPinned((previous) => {
      const next = previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id];
      writePinned(next);
      return next;
    });
  }

  const activeKind = POST_KINDS.find((option) => option.id === kind) ?? POST_KINDS[0];
  const title = `${activeKind.prefix}${draft.trim()}`;
  const titleReady = draft.trim().length >= 8 && title.length <= TITLE_LIMIT;
  const submitHref = `${SUBMIT}?title=${encodeURIComponent(title)}&text=${encodeURIComponent(activeKind.body)}`;
  const pinnedLabels = useMemo(
    () => SCENES.filter((scene) => pinned.includes(scene.id)).map((scene) => scene.label),
    [pinned],
  );

  return (
    <HubShell>
      <main className="cmShell">
        <section className="cmHero">
          <div>
            <span className="panelKicker">CAMPUS SOCIAL</span>
            <h1>Community</h1>
            <p>
              Find the people who are into what you are into, ask the campus the question the
              group chat cannot answer, and know what is happening before the posters go up.
            </p>
            <div className="cmHeroActions">
              <a className="blueButton" href={SUBREDDIT} target="_blank" rel="noreferrer noopener">
                Open r/NSUT_Delhi <ArrowUpRight size={13} />
              </a>
              <button className="cmGhost" type="button" onClick={() => setMapOpen(true)}>
                <Map size={15} /> Campus map
              </button>
              <a className="cmGhost" href={JUNOON} target="_blank" rel="noreferrer noopener">
                <Camera size={15} /> Junoon gallery
              </a>
            </div>
          </div>
          <div className="cmPulse">
            <div><small>WHERE CAMPUS TALKS</small><b>r/NSUT_Delhi</b></div>
            <div><small>FEST SEASON</small><b>Moksha, every March</b></div>
            <div><small>ON CAMPUS</small><b>Moksha · Innovision · Resonanz</b></div>
          </div>
        </section>

        <div className="cmGrid">
          {/* ---- Scenes: the useful half ---- */}
          <section className="cmCard" aria-labelledby="cmScenesTitle">
            <div className="cmCardHead">
              <div>
                <span className="panelKicker">PICK WHAT YOU&apos;RE INTO</span>
                <h2 id="cmScenesTitle">Find your people</h2>
                <p>Tap the scenes that sound like you. They are saved on this device, no account needed.</p>
              </div>
              <span className="cmBadge">{pinned.length ? `${pinned.length} pinned` : "None yet"}</span>
            </div>

            <div className="cmScenes">
              {SCENES.map((scene) => {
                const Icon = scene.icon;
                const picked = pinned.includes(scene.id);
                return (
                  <div className={`cmScene ${picked ? "picked" : ""}`} key={scene.id}>
                    <button
                      type="button"
                      className="cmScenePick"
                      aria-pressed={picked}
                      onClick={() => toggleScene(scene.id)}
                      title={picked ? `Unpin ${scene.label}` : `Pin ${scene.label}`}
                    >
                      <span className="cmSceneIcon"><Icon size={17} /></span>
                      <span className="cmSceneText">
                        <b>{scene.label}</b>
                        <small>{scene.blurb}</small>
                      </span>
                      <span className="cmSceneTick" aria-hidden="true">
                        {picked ? <Check size={16} /> : <Users size={15} />}
                      </span>
                    </button>
                    {/* One link per card made nine identical "threads" links;
                        the selected scene is the one that actually needs it. */}
                    {picked && (
                      <a
                        className="cmSceneLink"
                        href={sceneThreads(scene.q)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Open r/NSUT threads <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="cmSceneFoot">
              <Sparkles size={15} aria-hidden="true" />
              <span>
                {pinnedLabels.length
                  ? <>Your scene: <b>{pinnedLabels.join(" · ")}</b></>
                  : "Nothing pinned yet. Pick a scene and it stays here the next time you open the tab."}
              </span>
            </p>
          </section>

          {/* ---- Rail: real feeds, one tap away ---- */}
          <aside className="cmRail">
            <section className="cmCard">
              <div className="cmRailHead">
                <span className="cmRedditMark"><MessageCircle size={15} /></span>
                <span>
                  <b>r/NSUT_Delhi</b>
                  <small>Student-run, unofficial, unmoderated by NSUT</small>
                </span>
              </div>
              <a className="cmRailRow" href={NEW_THREADS} target="_blank" rel="noreferrer noopener">
                <Flame className="lead" size={16} />
                <span><b>Newest threads</b><small>What was posted minutes ago</small></span>
                <ArrowUpRight className="tail" size={14} />
              </a>
              <a className="cmRailRow" href={TOP_WEEK} target="_blank" rel="noreferrer noopener">
                <Trophy className="lead" size={16} />
                <span><b>Top this week</b><small>The threads the campus actually read</small></span>
                <ArrowUpRight className="tail" size={14} />
              </a>
              <a className="cmRailRow" href={SUBMIT} target="_blank" rel="noreferrer noopener">
                <PenLine className="lead" size={16} />
                <span><b>Start a thread</b><small>Open the plain Reddit composer</small></span>
                <ArrowUpRight className="tail" size={14} />
              </a>
              <a className="cmRailRow" href={JUNOON} target="_blank" rel="noreferrer noopener">
                <Camera className="lead" size={16} />
                <span><b>Junoon</b><small>NSUT&apos;s photography club, on their own site</small></span>
                <ArrowUpRight className="tail" size={14} />
              </a>
            </section>

            <section className="cmCard cmFest" aria-labelledby="cmFestTitle">
              <span className="panelKicker">FEST SEASON</span>
              <h2 id="cmFestTitle">Moksha &amp; friends</h2>
              <p>
                <b>Moksha</b> has run every year since 2003, usually over three days in March:
                music, dance, art, fashion and comedy, with student performers from colleges
                across India. Recent editions brought Sunidhi Chauhan, King and Raftaar to campus;
                past lineups include KK, Divine, Ritviz, Nucleya, Mohit Chauhan, Kailash Kher and
                Edward Maya. <b>Innovision</b> is the technical fest and <b>Resonanz</b> the
                intra-college cultural one.
              </p>
              <div className="cmFacts">
                <div><b>2003</b><small>running since</small></div>
                <div><b>3 days</b><small>of Moksha each March</small></div>
                <div><b>3 fests</b><small>across the year</small></div>
              </div>
              <div className="cmLinks">
                <a className="blueButton" href={MOKSHA} target="_blank" rel="noreferrer noopener">
                  Moksha site <ArrowUpRight size={13} />
                </a>
                <a className="cmTextLink" href="https://nsut.ac.in" target="_blank" rel="noreferrer noopener">
                  nsut.ac.in <ExternalLink size={12} />
                </a>
              </div>
            </section>
          </aside>
        </div>

        {/* ---- Composer: write here, post on Reddit ---- */}
        <section className="cmCard" aria-labelledby="cmComposeTitle">
          <div className="cmCardHead">
            <div>
              <span className="panelKicker">SAY IT ON THE FEED</span>
              <h2 id="cmComposeTitle">Ask the campus</h2>
              <p>
                Write your post here, then finish it on Reddit. The right template is filled in for
                you, and you can edit everything before submitting.
              </p>
            </div>
            <Compass className="cmHeadIcon" size={20} aria-hidden="true" />
          </div>

          <div className="cmKinds" role="group" aria-label="Post type">
            {POST_KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`cmKind ${option.id === kind ? "active" : ""}`}
                aria-pressed={option.id === kind}
                onClick={() => setKind(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="cmComposeLabel" htmlFor="cmComposeInput">Title</label>
          <div className="cmCompose">
            <textarea
              id="cmComposeInput"
              value={draft}
              maxLength={TITLE_LIMIT}
              rows={3}
              placeholder={activeKind.placeholder}
              onChange={(event) => setDraft(event.target.value)}
            />
            <span className="cmCount">{title.length}/{TITLE_LIMIT}</span>
          </div>

          <div className="cmComposeFoot">
            <small>
              {activeKind.body
                ? `Your post opens with a ${activeKind.label.toLowerCase()} template. NsutNest never posts on your behalf.`
                : "Your post opens on Reddit, where you can add detail and a flair before submitting."}
            </small>
            {titleReady ? (
              <a className="cmPost" href={submitHref} target="_blank" rel="noreferrer noopener">
                Continue on Reddit <ArrowUpRight size={14} />
              </a>
            ) : (
              <span className="cmPostOff"><PenLine size={14} /> Write at least 8 characters</span>
            )}
          </div>
        </section>

        {/* ---- Gallery: real photos, credited ---- */}
        <section aria-labelledby="cmGalleryTitle">
          <div className="cmCardHead cmGalleryHead">
            <div>
              <span className="panelKicker">CAMPUS FRAMES</span>
              <h2 id="cmGalleryTitle">Shot by Junoon</h2>
              <p>Fest and campus photography from NSUT&apos;s photography club.</p>
            </div>
            <a className="cmTextLink" href={`${JUNOON}/collections`} target="_blank" rel="noreferrer noopener">
              All collections <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="cmGalleryGrid">
            {GALLERY.map((shot) => (
              <a
                className="cmShot"
                key={shot.title}
                href={`${JUNOON}/collections`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.img} alt={`${shot.title}, ${shot.year}, photographed by Junoon NSUT`} loading="lazy" />
                <span className="cmShotCap">
                  <span>{shot.title} <small>{shot.year}</small></span>
                  <ExternalLink size={13} aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
          <p className="cmCredit">
            Photos courtesy <a href={JUNOON} target="_blank" rel="noreferrer noopener">Junoon, NSUT</a>.
            All rights with the photographers.
          </p>
        </section>

        <p className="cmDisclaimer">
          NsutNest is an unofficial student project. Community threads live on r/NSUT_Delhi, which is
          run by students — not by the university.
        </p>
      </main>

      {mapOpen && (
        <div
          className="campusMapOverlay"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setMapOpen(false); }}
        >
          <section className="campusMapDialog" role="dialog" aria-modal="true" aria-label="NSUT campus map">
            <div className="campusMapHeader">
              <div><small className="panelKicker">EXPLORE NSUT</small><h2>Campus map</h2></div>
              <button type="button" className="campusMapClose" aria-label="Close campus map" onClick={() => setMapOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="campusMapImage"
              src="/campus-map.png"
              alt="Illustrated map of the NSUT campus with academic blocks, hostels, grounds, library and main gate"
            />
          </section>
        </div>
      )}
    </HubShell>
  );
}
