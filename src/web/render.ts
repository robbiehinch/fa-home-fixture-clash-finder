import type {
  Allocation,
  AppConfig,
  Clash,
  Fixture,
  PitchGroup,
} from "../lib/types.js";

export type RenderModel = {
  config: AppConfig;
  scrapedAt: string;
  fixtures: Fixture[];
  clashes: Clash[];
  allocations: Allocation[];
};

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
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

function formatScrapedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB");
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
    li.textContent = `${f.kickoff} · ${f.ageGroup ?? "?"} · ${f.homeTeam} vs ${f.awayTeam}`;
    list.appendChild(li);
  }
  banner.appendChild(list);
  return banner;
}

function renderAllocationTable(
  allocation: Allocation,
  group: PitchGroup,
): HTMLElement {
  const wrap = el("div", { class: "allocation" });
  const table = el("table", { class: "allocation__table" });
  const thead = el("thead");
  const headerRow = el("tr");
  headerRow.appendChild(el("th", {}, "Session"));
  for (const pitch of group.pitches) headerRow.appendChild(el("th", {}, pitch));
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el("tbody");
  for (const session of group.sessions) {
    const row = el("tr");
    row.appendChild(el("th", { scope: "row" }, `${session.name} (${session.start})`));
    for (const pitch of group.pitches) {
      const cell = el("td");
      const assign = allocation.assignments.find(
        (a) => a.session === session.name && a.pitch === pitch,
      );
      if (assign) {
        cell.textContent = `${assign.fixture.kickoff} · ${assign.fixture.ageGroup ?? "?"} · ${assign.fixture.homeTeam.replace(/^.*?U\d+\s*/, "")} vs ${assign.fixture.awayTeam}`;
      } else {
        cell.className = "allocation__empty";
        cell.textContent = "—";
      }
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  if (allocation.partialClash) {
    const warn = el(
      "p",
      { class: "banner banner--partial" },
      "Partial clash: total fits, but one session is over capacity (overflow shown below).",
    );
    wrap.appendChild(warn);
  }
  if (allocation.unassigned.length > 0) {
    const heading = el("p", { class: "allocation__unassigned-heading" }, "Unassigned");
    const list = el("ul", { class: "fixture-list" });
    for (const f of allocation.unassigned) {
      const li = el("li");
      li.textContent = `${f.kickoff} · ${f.ageGroup ?? "?"} · ${f.homeTeam} vs ${f.awayTeam}`;
      list.appendChild(li);
    }
    wrap.appendChild(heading);
    wrap.appendChild(list);
  }
  return wrap;
}

function renderDateSection(
  date: string,
  config: AppConfig,
  entries: Map<string, { clash?: Clash; allocation?: Allocation }>,
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
      groupBlock.appendChild(renderAllocationTable(entry.allocation, group));
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
    `Last scraped: ${formatScrapedAt(model.scrapedAt)} · Showing ${model.fixtures.length} fixtures`,
  );
  header.appendChild(meta);
  root.appendChild(header);

  const entries = groupIndex(model.allocations, model.clashes);
  const dates = Array.from(
    new Set([...model.clashes.map((c) => c.date), ...model.allocations.map((a) => a.date)]),
  ).sort();

  if (dates.length === 0) {
    root.appendChild(
      el(
        "p",
        { class: "empty" },
        "No home fixtures in the configured date range.",
      ),
    );
    return;
  }

  for (const date of dates) {
    const section = renderDateSection(date, model.config, entries);
    if (section) root.appendChild(section);
  }
}
