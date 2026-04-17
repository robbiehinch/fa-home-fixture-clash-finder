import type {
  Allocation,
  AllocationOverride,
  AppConfig,
  Assignment,
  Clash,
  Fixture,
  PitchGroup,
} from "../lib/types.js";

export type RenderCallbacks = {
  onShiftWindow: (deltaDays: number) => void;
  onResetWindow: () => void;
  onMoveFixture: (fixtureId: string, slot: AllocationOverride["slot"]) => void;
  onResetAllocations: () => void;
};

export type RenderModel = RenderCallbacks & {
  config: AppConfig;
  scrapedAt: string;
  fixtures: Fixture[];
  clashes: Clash[];
  allocations: Allocation[];
  window: { from: string; to: string };
  offsetDays: number;
  hasOverrides: boolean;
};

function el(
  tag: string,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatScrapedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB");
}

function shortHomeTeam(home: string): string {
  return home.replace(/^.*?U\d+\s*/, "").trim() || home;
}

function groupIndex(
  allocations: Allocation[],
  clashes: Clash[],
): Map<string, { clash?: Clash; allocation?: Allocation }> {
  const map = new Map<string, { clash?: Clash; allocation?: Allocation }>();
  const key = (date: string, group: string) => `${date}|${group}`;
  for (const c of clashes) map.set(key(c.date, c.pitchGroup), { clash: c });
  for (const a of allocations) {
    const k = key(a.date, a.pitchGroup);
    const entry = map.get(k) ?? {};
    entry.allocation = a;
    map.set(k, entry);
  }
  return map;
}

function renderNav(model: RenderModel): HTMLElement {
  const bar = el("div", { class: "nav-bar" });
  const prev = el("button", { type: "button", class: "nav-bar__btn" }, "\u25C0 Prev week");
  prev.addEventListener("click", () => model.onShiftWindow(-7));
  const today = el("button", { type: "button", class: "nav-bar__btn" }, "Today");
  today.addEventListener("click", () => model.onResetWindow());
  const next = el("button", { type: "button", class: "nav-bar__btn" }, "Next week \u25B6");
  next.addEventListener("click", () => model.onShiftWindow(7));

  const label = el(
    "span",
    { class: "nav-bar__label" },
    `${formatShortDate(model.window.from)} \u2013 ${formatShortDate(model.window.to)}`,
  );

  const left = el("div", { class: "nav-bar__group" });
  left.appendChild(prev);
  left.appendChild(today);
  left.appendChild(next);

  const right = el("div", { class: "nav-bar__group" });
  right.appendChild(label);
  if (model.hasOverrides) {
    const reset = el(
      "button",
      { type: "button", class: "nav-bar__btn nav-bar__btn--reset" },
      "Reset allocations",
    );
    reset.addEventListener("click", () => {
      if (confirm("Discard all manual pitch changes?")) model.onResetAllocations();
    });
    right.appendChild(reset);
  }

  bar.appendChild(left);
  bar.appendChild(right);
  return bar;
}

function renderClashBanner(clash: Clash): HTMLElement {
  const banner = el("div", { class: "banner banner--clash", role: "alert" });
  banner.appendChild(
    el(
      "strong",
      {},
      `Clash: ${clash.count} home fixtures, capacity ${clash.capacity}`,
    ),
  );
  const list = el("ul", { class: "fixture-list" });
  for (const f of clash.fixtures) {
    const li = el("li");
    li.textContent = `${f.kickoff} \u00B7 ${f.ageGroup ?? "?"} \u00B7 ${f.homeTeam} vs ${f.awayTeam}`;
    list.appendChild(li);
  }
  banner.appendChild(list);
  return banner;
}

function renderFixtureChip(fixture: Fixture): HTMLElement {
  const chip = el("div", {
    class: "chip",
    draggable: "true",
    "data-fixture-id": fixture.id,
    title: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
  });
  chip.appendChild(el("span", { class: "chip__age" }, fixture.ageGroup ?? "?"));
  chip.appendChild(el("span", { class: "chip__kickoff" }, fixture.kickoff));
  chip.appendChild(
    el("span", { class: "chip__teams" }, `${shortHomeTeam(fixture.homeTeam)} vs ${fixture.awayTeam}`),
  );
  return chip;
}

type DropTarget =
  | { kind: "slot"; session: string; pitch: string }
  | { kind: "unassigned" };

function wireDragSource(chip: HTMLElement, fixtureId: string): void {
  chip.addEventListener("dragstart", (ev) => {
    ev.dataTransfer?.setData("text/plain", fixtureId);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
    document.body.classList.add("is-dragging");
    chip.classList.add("chip--dragging");
  });
  chip.addEventListener("dragend", () => {
    document.body.classList.remove("is-dragging");
    chip.classList.remove("chip--dragging");
  });
}

function wireDropTarget(
  node: HTMLElement,
  target: DropTarget,
  onDrop: (fixtureId: string, target: DropTarget) => void,
): void {
  node.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    node.classList.add("drop-hover");
  });
  node.addEventListener("dragleave", () => {
    node.classList.remove("drop-hover");
  });
  node.addEventListener("drop", (ev) => {
    ev.preventDefault();
    node.classList.remove("drop-hover");
    const fixtureId = ev.dataTransfer?.getData("text/plain");
    if (!fixtureId) return;
    onDrop(fixtureId, target);
  });
}

function renderPitchGrid(
  allocation: Allocation,
  group: PitchGroup,
  onMove: (fixtureId: string, slot: AllocationOverride["slot"]) => void,
): HTMLElement {
  const wrap = el("div", { class: "allocation" });
  const grid = el("div", {
    class: "pitch-grid",
    style: `--pitches: ${group.pitches.length}`,
  });

  const corner = el("div", { class: "pitch-grid__corner" });
  grid.appendChild(corner);
  for (const pitch of group.pitches) {
    grid.appendChild(el("div", { class: "pitch-grid__col-head" }, pitch));
  }

  const findAssignment = (session: string, pitch: string): Assignment | undefined =>
    allocation.assignments.find((a) => a.session === session && a.pitch === pitch);

  const onDrop = (fixtureId: string, target: DropTarget): void => {
    onMove(
      fixtureId,
      target.kind === "unassigned"
        ? "unassigned"
        : { session: target.session, pitch: target.pitch },
    );
  };

  for (const session of group.sessions) {
    grid.appendChild(
      el(
        "div",
        { class: "pitch-grid__row-head" },
        `${session.name}\n${session.start}`,
      ),
    );
    for (const pitch of group.pitches) {
      const card = el("div", { class: "pitch-card" });
      card.appendChild(el("div", { class: "pitch-card__markings" }));
      const content = el("div", { class: "pitch-card__content" });
      const assignment = findAssignment(session.name, pitch);
      if (assignment) {
        const chip = renderFixtureChip(assignment.fixture);
        wireDragSource(chip, assignment.fixture.id);
        content.appendChild(chip);
      } else {
        card.classList.add("pitch-card--empty");
        content.appendChild(
          el("span", { class: "pitch-card__placeholder" }, "Drop here"),
        );
      }
      card.appendChild(content);
      wireDropTarget(card, { kind: "slot", session: session.name, pitch }, onDrop);
      grid.appendChild(card);
    }
  }
  wrap.appendChild(grid);

  if (allocation.partialClash) {
    wrap.appendChild(
      el(
        "p",
        { class: "banner banner--partial" },
        "Partial clash: total fits, but one session is over capacity (overflow shown below).",
      ),
    );
  }

  const bench = el("div", { class: "bench" });
  bench.appendChild(
    el(
      "p",
      { class: "bench__heading" },
      allocation.unassigned.length > 0 ? "On the bench" : "Bench (drop here to unassign)",
    ),
  );
  const benchList = el("div", { class: "bench__list" });
  for (const fixture of allocation.unassigned) {
    const chip = renderFixtureChip(fixture);
    wireDragSource(chip, fixture.id);
    benchList.appendChild(chip);
  }
  if (allocation.unassigned.length === 0) {
    benchList.appendChild(
      el("span", { class: "bench__empty" }, "No unassigned fixtures."),
    );
  }
  bench.appendChild(benchList);
  wireDropTarget(bench, { kind: "unassigned" }, onDrop);
  wrap.appendChild(bench);

  return wrap;
}

function renderDateSection(
  date: string,
  config: AppConfig,
  entries: Map<string, { clash?: Clash; allocation?: Allocation }>,
  onMove: (fixtureId: string, slot: AllocationOverride["slot"]) => void,
): HTMLElement | null {
  const section = el("section", { class: "date-section" });
  const heading = el("h2", {}, formatDate(date));
  section.appendChild(heading);
  let hasContent = false;
  for (const group of config.pitchGroups) {
    const entry = entries.get(`${date}|${group.name}`);
    if (!entry) continue;
    hasContent = true;
    const groupBlock = el("div", { class: "pitch-group" });
    groupBlock.appendChild(el("h3", {}, group.name));
    if (entry.clash) {
      groupBlock.appendChild(renderClashBanner(entry.clash));
    } else if (entry.allocation) {
      groupBlock.appendChild(renderPitchGrid(entry.allocation, group, onMove));
    }
    section.appendChild(groupBlock);
  }
  return hasContent ? section : null;
}

export function renderPage(root: HTMLElement, model: RenderModel): void {
  root.innerHTML = "";
  const header = el("header", { class: "page-header" });
  header.appendChild(el("h1", {}, model.config.club.name));
  const meta = el(
    "p",
    { class: "page-header__meta" },
    `Last scraped: ${formatScrapedAt(model.scrapedAt)} \u00B7 Showing ${model.fixtures.length} fixtures`,
  );
  header.appendChild(meta);
  root.appendChild(header);

  root.appendChild(renderNav(model));

  const entries = groupIndex(model.allocations, model.clashes);
  const dates = Array.from(
    new Set([
      ...model.clashes.map((c) => c.date),
      ...model.allocations.map((a) => a.date),
    ]),
  ).sort();

  if (dates.length === 0) {
    root.appendChild(
      el("p", { class: "empty" }, "No home fixtures in this 4-week window."),
    );
    return;
  }

  for (const date of dates) {
    const section = renderDateSection(date, model.config, entries, model.onMoveFixture);
    if (section) root.appendChild(section);
  }
}
