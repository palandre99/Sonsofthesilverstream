/** The Map page on the website — the same map the phone shows.
 *
 * The data and the maths are shared byte-for-byte with the app (src/map/,
 * guarded by a parity test). Only the rendering differs: the phone drives a
 * Reanimated transform on the UI thread, the web drives a CSS transform on the
 * compositor. Both end up moving one container and culling markers against the
 * visible rectangle, so the two stay honest about each other.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MAP_TILES, MAX_TILE_Z, TILE_SIZE } from '../data/tileIndex.g';
import { MAP_REGIONS } from '../data/mapMeta.g';
import { REGION_SPOTS } from '../data/regionSpots.g';
import { clusterPoints, nearestPoint, pointsInRect } from '../map/points';
import { regionOf, tileLevelFor, uvToReadout, type RegionId } from '../map/projection';
import {
  alphaSpots, dungeonPoints, isNightOnly, poiLayer, poiLayers, poiName,
  poiPoints, searchPlaces, spawnLevels, spawnPoints, spawnablePals, wildBands,
  type LayerGroup,
} from '../map/layers';
import { box } from '../state';
import { clearFound, foundCount, foundKey, isFound, toggleFound } from '../map/found';

const BASE = 1024;
const MAX_ZOOM = 14;
const PIN = 23;

interface Layer {
  key: string;
  label: string;
  colour: string;
  square?: boolean;
  /** the GAME's own symbol for this layer, served from /mapicons/ */
  art?: string;
  set: ReturnType<typeof poiPoints>;
}

export function MapPage() {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ tx: 0, ty: 0, k: 0 });
  const [region, setRegion] = useState<RegionId>('palpagos');
  const [poiOn, setPoiOn] = useState<Set<string>>(new Set());
  const [palsOn, setPalsOn] = useState<Set<string>>(new Set());
  const [dungeons, setDungeons] = useState(false);
  const [night, setNight] = useState(true);
  const [q, setQ] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [picked, setPicked] = useState<
    { title: string; lines: string[]; at: string; mark?: string; pal?: string } | null
  >(null);
  const [ticks, setTicks] = useState(0);   // bumps when a tick changes

  const contain = Math.min(size.w, size.h) || 1;

  /* -------------------------------------------------------------- sizing */

  // Until the player pans or zooms, re-fit on every resize. Locking the fit in
  // on the FIRST measurement is what letterboxed the map: the observer fires
  // before the grid has settled, so the map framed itself to a box that no
  // longer existed a frame later.
  const touched = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setSize({ w: r.width, h: r.height });
      if (touched.current) return;
      const cover = Math.max(r.width, r.height);
      setView({ k: cover, tx: (r.width - cover) / 2, ty: (r.height - cover) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamp = useCallback((tx: number, ty: number, k: number) => ({
    tx: k < size.w ? (size.w - k) / 2 : Math.min(0, Math.max(size.w - k, tx)),
    ty: k < size.h ? (size.h - k) / 2 : Math.min(0, Math.max(size.h - k, ty)),
    k,
  }), [size.h, size.w]);

  /* ------------------------------------------------------------ gestures */

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    touched.current = true;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => clamp(d.tx + (e.clientX - d.x), d.ty + (e.clientY - d.y), v.k));
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    // a press that never moved is a tap, not a pan
    if (d && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      identify((e.clientX - r.left - view.tx) / view.k, (e.clientY - r.top - view.ty) / view.k);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    touched.current = true;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fx = e.clientX - r.left;
    const fy = e.clientY - r.top;
    setView((v) => {
      const next = Math.min(contain * MAX_ZOOM,
        Math.max(contain, v.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      const ratio = next / v.k;
      return clamp(fx - (fx - v.tx) * ratio, fy - (fy - v.ty) * ratio, next);
    });
  };

  /* ------------------------------------------------------- what is shown */

  const rect = useMemo(() => ({
    u0: -view.tx / (view.k || 1),
    v0: -view.ty / (view.k || 1),
    u1: (-view.tx + size.w) / (view.k || 1),
    v1: (-view.ty + size.h) / (view.k || 1),
  }), [size.h, size.w, view]);

  const time = useMemo(() => ({ day: true, night }), [night]);
  const level = useMemo(() => ({ lo: 1, hi: 80 }), []);

  const active = useMemo<Layer[]>(() => {
    const out: Layer[] = [];
    for (const id of poiOn) {
      const set = poiPoints(id, region);
      const l = poiLayer(id);
      if (set?.n && l) {
        out.push({
          key: `poi:${id}`, label: l.label, colour: l.colour, set,
          art: `mapicons/${id}.png`,
        });
      }
    }
    for (const pal of palsOn) {
      const surface = spawnPoints(pal, region, time, level);
      if (surface?.n) {
        out.push({
          key: `pal:${pal}`,
          label: pal,
          colour: isNightOnly(pal, region) ? '#9B8CFF' : '#3FC1C9',
          set: surface,
        });
      }
      if (dungeons) {
        const inside = dungeonPoints(pal, region, time, level);
        if (inside?.n) {
          out.push({
            key: `dun:${pal}`,
            label: `${pal} — in dungeons`,
            colour: '#8AA6FF',
            square: true,
            set: inside,
          });
        }
      }
    }
    return out;
  }, [dungeons, level, palsOn, poiOn, region, time]);

  const markers = useMemo(() => {
    if (!view.k) return [];
    const budget = Math.max(40, Math.floor(360 / Math.max(1, active.length)));
    const out: {
      key: string; u: number; v: number; count: number; l: Layer; done: boolean;
    }[] = [];
    for (const l of active) {
      if (!l.set) continue;
      const hits = pointsInRect(l.set, rect.u0, rect.v0, rect.u1, rect.v1);
      for (const c of clusterPoints(l.set, hits, view.k, PIN + 14).slice(0, budget)) {
        const done = c.count === 1 && l.key.startsWith('poi:')
          && isFound(foundKey(l.key.slice(4), region, c.index));
        out.push({ key: `${l.key}:${c.cell}`, u: c.u, v: c.v, count: c.count, l, done });
      }
    }
    return out;
  }, [active, rect, region, ticks, view.k]);

  /** The fixed boss of any picked pal — the one guaranteed place to meet it. */
  const bossPins = useMemo(() => {
    const out: { key: string; u: number; v: number }[] = [];
    for (const pal of palsOn) {
      alphaSpots(pal, region).forEach((a, i) => {
        out.push({ key: `boss:${pal}:${i}`, u: a.u, v: a.v });
      });
    }
    return out;
  }, [palsOn, region]);

  const places = useMemo(() => searchPlaces(q, region), [q, region]);

  const goToPlace = useCallback((u: number, v: number) => {
    touched.current = true;
    // fit ~0.07 uv across the shorter edge — a landmark and its surroundings
    const next = Math.min(contain * MAX_ZOOM,
      Math.max(contain, Math.min(size.w, size.h) / 0.07));
    setView(clamp(size.w / 2 - u * next, size.h / 2 - v * next, next));
  }, [clamp, contain, size.h, size.w]);

  const identify = useCallback((u: number, v: number) => {
    const reach = 26 / Math.max(1, view.k);
    let best: Layer | null = null;
    let bestIndex = -1;
    let bestD = Infinity;
    for (const l of active) {
      if (!l.set) continue;
      const p = nearestPoint(l.set, u, v, reach);
      if (p == null) continue;
      const du = l.set.xy[p * 2] - u;
      const dv = l.set.xy[p * 2 + 1] - v;
      const d = du * du + dv * dv;
      if (d < bestD) { bestD = d; best = l; bestIndex = p; }
    }
    const r = uvToReadout({ u, v }, regionOf(region));
    if (!best) { setPicked(null); return; }
    const lines: string[] = [];
    const pal = best.key.startsWith('pal:') || best.key.startsWith('dun:') ? best.key.slice(4) : null;
    if (pal) {
      // A dungeon pin quotes the DUNGEON band. Asking the surface-only
      // question here printed no level at all for the 25 pals that never come
      // up top - you tapped a pin and the app had nothing to say about it.
      const lv = best.key.startsWith('dun:')
        ? wildBands(pal).dungeon : spawnLevels(pal, region);
      if (lv) lines.push(lv.lo === lv.hi ? `Level ${lv.lo}` : `Level ${lv.lo}–${lv.hi}`);
      if (isNightOnly(pal, region)) lines.push('Only comes out at night');
      if (best.key.startsWith('dun:')) lines.push('Inside a dungeon, not on the surface');
    }
    // a place's own name beats the layer's name every time
    const own = best.key.startsWith('poi:')
      ? poiName(best.key.slice(4), region, bestIndex)
      : '';
    setPicked({
      title: own || best.label,
      lines: own ? [best.label, ...lines] : lines,
      at: `${r.x}, ${r.y}`,
      mark: best.key.startsWith('poi:')
        ? foundKey(best.key.slice(4), region, bestIndex)
        : undefined,
      // an alpha pin IS a pal; the router already deep-links the Paldex
      pal: pal ?? (own.startsWith('Alpha ') ? own.slice(6) : undefined),
    });
  }, [active, region, view.k]);

  /* -------------------------------------------------------------- tiles */

  const tiles = useMemo(() => {
    if (!view.k) return [];
    const z = tileLevelFor(view.k, TILE_SIZE, MAX_TILE_Z);
    const n = 1 << z;
    const step = BASE / n;
    const have = MAP_TILES[region] ?? new Set<string>();
    const out: { key: string; x: number; y: number; step: number; src: string }[] = [];
    for (let y = Math.max(0, Math.floor(rect.v0 * n)); y <= Math.min(n - 1, Math.floor(rect.v1 * n)); y++) {
      for (let x = Math.max(0, Math.floor(rect.u0 * n)); x <= Math.min(n - 1, Math.floor(rect.u1 * n)); x++) {
        if (!have.has(`${z}_${x}_${y}`)) continue;   // open ocean: base shows through
        out.push({ key: `${z}_${x}_${y}`, x: x * step, y: y * step, step,
          src: `map/${region}/${z}_${x}_${y}.webp` });
      }
    }
    return out;
  }, [rect, region, view.k]);

  /** Place names, same rules as the phone: only once zoomed past twice the
   *  whole-map view, and never two boxes on top of each other. */
  const labels = useMemo(() => {
    if (region !== 'palpagos' || view.k < 760) return [];
    const inset = 75 / view.k;
    const near = Object.entries(REGION_SPOTS).filter(([, at]) => (
      at.x > rect.u0 + inset && at.x < rect.u1 - inset
      && at.y > rect.v0 && at.y < rect.v1
    ));
    near.sort((a, b) => a[1].y - b[1].y || a[0].localeCompare(b[0]));
    // Collision box sized from the NAME — a constant box makes short names hog
    // room they do not use and long ones under-reserve it.
    const placed: { x: number; y: number; w: number }[] = [];
    const minY = 26 / view.k;
    const out: { name: string; x: number; y: number }[] = [];
    for (const [name, at] of near) {
      const w2 = Math.min(150, name.length * 5.9) / view.k;
      if (placed.some((q2) => (
        Math.abs(q2.x - at.x) < (w2 + q2.w) / 2 && Math.abs(q2.y - at.y) < minY
      ))) continue;
      placed.push({ x: at.x, y: at.y, w: w2 });
      out.push({ name, x: at.x, y: at.y });
    }
    return out;
  }, [rect, region, view.k]);

  const palList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return spawnablePals().filter((n) => {
      if (needle && !n.toLowerCase().includes(needle)) return false;
      if (missingOnly && (box.value[n]?.m || box.value[n]?.f)) return false;
      // dungeon-aware, exactly as on the phone: with the box ticked the 25
      // pals that only live underground belong in this list too
      return spawnLevels(n, region, dungeons) !== null;
    });
  }, [dungeons, missingOnly, q, region]);

  /**
   * How many of this layer are on the map you are LOOKING AT.
   *
   * The buttons printed `l.n`, which is the layer's total across both maps —
   * so Palpagos offered "Fast travel 170" while showing 155 of them, and the
   * World Tree offered the same 170 while showing 15. The phone was fixed
   * (L24); the website was not.
   */
  const poiHere = (id: string): string => {
    const n = poiPoints(id, region)?.n ?? 0;
    return n ? n.toLocaleString() : '';
  };

  const shown = active.reduce((n, l) => n + (l.set?.n ?? 0), 0);
  const groups = useMemo(() => {
    const by = new Map<LayerGroup, ReturnType<typeof poiLayers>>();
    for (const l of poiLayers()) by.set(l.group, [...(by.get(l.group) ?? []), l]);
    return [...by.entries()];
  }, []);

  return (
    <div class="mapwrap">
      <div
        class="mapstage"
        ref={wrap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        <div
          class="mapcontent"
          style={{
            width: BASE, height: BASE,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k / BASE})`,
          }}
        >
          <img class="maptile" src={`map/${region}/0_0_0.webp`} alt=""
            style={{ left: 0, top: 0, width: BASE, height: BASE }} />
          {tiles.map((t) => (
            <img key={t.key} class="maptile" src={t.src} alt=""
              style={{ left: t.x, top: t.y, width: t.step + 0.5, height: t.step + 0.5 }} />
          ))}
          {labels.map((l) => (
            <div key={l.name} class="maplabel"
              style={{
                left: l.x * BASE, top: l.y * BASE,
                transform: `translate(-50%, -50%) scale(${BASE / view.k})`,
              }}>{l.name}</div>
          ))}
          {bossPins.map((b) => (
            <div key={b.key} class="mappin boss"
              style={{
                left: b.u * BASE, top: b.v * BASE,
                transform: `translate(-50%, -50%) scale(${BASE / view.k})`,
              }} />
          ))}
          {markers.map((m) => (
            <div
              key={m.key}
              class={`mappin${m.l.square ? ' sq' : ''}`}
              style={{
                left: m.u * BASE, top: m.v * BASE,
                borderColor: m.l.colour, color: m.l.colour,
                // a found marker fades back, so what stands out is what is left
                opacity: m.done ? 0.32 : 1,
                transform: `translate(-50%, -50%) scale(${BASE / view.k})`,
              }}
            >
              {m.count > 1
                ? m.count
                : m.l.art
                  ? <img class="mappinart" src={m.l.art} alt="" />
                  : ''}
            </div>
          ))}
        </div>

        <div class="maptop">
          {MAP_REGIONS.map((r) => (
            <button key={r.id} type="button" class={region === r.id ? 'on' : ''}
              onClick={() => setRegion(r.id as RegionId)}>{r.name}</button>
          ))}
        </div>

        {picked && (
          <div class="mapcard">
            <b>{picked.title}</b><span>{picked.at}</span>
            {picked.lines.map((l) => <em key={l}>{l}</em>)}
            {picked.pal && (
              <a class="mapmark go" href={`#/paldex/${encodeURIComponent(picked.pal)}`}>
                Open {picked.pal}
              </a>
            )}
            {picked.mark && (
              <button type="button" class={isFound(picked.mark) ? 'mapmark on' : 'mapmark'}
                onClick={() => { toggleFound(picked.mark!); setTicks((n) => n + 1); }}>
                {isFound(picked.mark) ? '✓ Got this one' : 'Mark as found'}
              </button>
            )}
          </div>
        )}
        {shown === 0 && (
          <div class="maphint">
            <b>Nothing on the map yet</b>
            <em>Search a pal to see everywhere it spawns, or tick “only pals
            I'm missing” to see what is left to catch. Places are searchable
            by name too.</em>
            <em>“What to show” puts chests, ore, statues, dungeons and bosses
            on it.</em>
          </div>
        )}
        {shown > 0 && (
          <div class="maplegend">
            {active.map((l) => (
              <span key={l.key}>
                <i class={l.square ? 'sq' : ''} style={{ borderColor: l.colour }} />
                {l.label}<b>{(l.set?.n ?? 0).toLocaleString()}</b>
              </span>
            ))}
            {active.some((l) => l.square) && (
              <em>{active.some((l) => !l.square)
                ? 'Round pins are out in the world · square pins are inside dungeons'
                : 'Square pins are inside dungeons — none of these are on the surface'}</em>
            )}
          </div>
        )}
      </div>

      <aside class="mapside">
        <h3>Find a pal or place</h3>
        <input value={q} placeholder="Search pals or places…"
          onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <label class="mapchk">
          <input type="checkbox" checked={missingOnly}
            onChange={() => setMissingOnly((v) => !v)} /> Only pals I&apos;m missing
        </label>
        <label class="mapchk">
          <input type="checkbox" checked={dungeons}
            onChange={() => setDungeons((v) => !v)} /> Also show dungeon spawns
        </label>
        <label class="mapchk">
          <input type="checkbox" checked={night}
            onChange={() => setNight((v) => !v)} /> Include night-only spawns
        </label>
        {places.length > 0 && (
          <div class="mapplaces">
            <h3>Places</h3>
            {places.map((pl) => (
              <button key={`${pl.layerId}:${pl.name}`} type="button"
                onClick={() => goToPlace(pl.u, pl.v)}>
                {pl.name}<i>{pl.label}</i>
              </button>
            ))}
          </div>
        )}
        {palList.length === 0 && (
          /* Typing a name that matches nothing used to make the whole list
             vanish with no word about it. The phone names its own reason and
             the site should too — and each branch says only what is TRUE of
             it, since the list is narrowed by the search AND the checkboxes. */
          <p class="mapempty">
            {places.length > 0
              ? 'No pal by that name — but the places above match.'
              : q.trim() && missingOnly
                ? 'No pal by that name is still missing from your box.'
                : q.trim()
                  ? 'Nothing on this map goes by that name.'
                  : missingOnly
                    ? 'Nothing left to find here — you own every pal that spawns on this map.'
                    : 'No pal on this map matches those settings.'}
          </p>
        )}
        <div class="mappals">
          {palList.map((n) => {
            const lv = spawnLevels(n, region, dungeons);
            return (
              <button key={n} type="button" class={palsOn.has(n) ? 'on' : ''}
                onClick={() => setPalsOn((s) => {
                  const next = new Set(s);
                  if (next.has(n)) next.delete(n); else next.add(n);
                  return next;
                })}>
                {n}{lv ? <i>Lv {lv.lo === lv.hi ? lv.lo : `${lv.lo}–${lv.hi}`}</i> : null}
              </button>
            );
          })}
        </div>

        {foundCount() > 0 && (
          <button type="button" class="mapclear"
            onClick={() => { clearFound(); setTicks((n) => n + 1); }}>
            Clear {foundCount()} found {foundCount() === 1 ? 'mark' : 'marks'}
          </button>
        )}

        <h3>What to show</h3>
        {groups.map(([group, list]) => (
          <div key={group} class="maplayers">
            {list.map((l) => (
              <button key={l.id} type="button"
                class={`${poiOn.has(l.id) ? 'on' : ''}${poiPoints(l.id, region)?.n ? '' : ' empty'}`}
                style={poiOn.has(l.id) ? { borderColor: l.colour, color: l.colour } : undefined}
                onClick={() => setPoiOn((s) => {
                  const next = new Set(s);
                  if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                  return next;
                })}>
                {l.label} <i>{poiHere(l.id) || 'none here'}</i>
              </button>
            ))}
          </div>
        ))}
      </aside>
    </div>
  );
}
