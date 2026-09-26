/// Attribute import for collections: read a .csv / .json / .xml file and map each
/// row to the right image.
///
/// CSV rule (what the spec asks for): COLUMN 1 identifies the image; every other
/// column is a trait, with the header as the trait name.
///
///     filename,Background,Eyes,Rarity
///     1.png,Purple,Laser,Rare
///     2.png,Black,Sleepy,Common
///
/// Column 1 matches an image by file name (extension optional, case-insensitive)
/// or by number. Two special headers are treated as text, not traits: `name` and
/// `description`.

import { cleanLine } from "./sanitize";

export type Attr = { trait_type: string; value: string };
export type RowInfo = { key: string; attributes: Attr[]; name?: string; description?: string };
export type ParseResult = { rows: RowInfo[]; format: "csv" | "json" | "xml"; warnings: string[] };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)$/i;

/// "Folder/Photo.PNG" -> "photo",  "007" -> "007",  "v1.2" -> "v1.2"
export function stemOf(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").trim();
  return base.replace(IMAGE_EXT, "").trim().toLowerCase();
}

/// Natural filename order (1, 2, 10 - not 1, 10, 2). Token ids follow this order.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// ------------------------------------------------------------------ CSV
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  // pick the delimiter that appears most in the first line (Excel in some locales saves ";")
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const TEXT_HEADERS = new Set(["name", "description"]);

export function parseCsvAttributes(text: string): ParseResult {
  const warnings: string[] = [];
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], format: "csv", warnings: ["The CSV needs a header row and at least one data row."] };
  }
  const header = table[0].map((h) => h.trim());
  if (IMAGE_EXT.test(header[0])) {
    warnings.push("The first row looks like an image name, not a header. The first row must be the header (column 1 = file name, other columns = trait names).");
  }
  const rows: RowInfo[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const key = (cells[0] ?? "").trim();
    if (!key) continue;
    const row: RowInfo = { key, attributes: [] };
    for (let c = 1; c < header.length; c++) {
      const h = cleanLine(header[c] ?? "", 64);
      const v = cleanLine((cells[c] ?? "").trim(), 128);
      if (!h || v === "") continue;
      const lower = h.toLowerCase();
      if (TEXT_HEADERS.has(lower)) {
        if (lower === "name") row.name = cleanLine(v, 100);
        else row.description = v;
      } else row.attributes.push({ trait_type: h, value: v });
    }
    rows.push(row);
  }
  return { rows, format: "csv", warnings };
}

// ------------------------------------------------------------------ JSON
const KEY_FIELDS = ["file", "filename", "fileName", "image", "imageName", "id", "tokenId", "token_id", "edition"];
const RESERVED = new Set([...KEY_FIELDS, "name", "description", "external_url", "attributes", "animation_url", "dna", "date", "compiler", "traits"]);

function attrsFromUnknown(v: unknown): Attr[] {
  if (Array.isArray(v)) {
    const out: Attr[] = [];
    for (const item of v) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const t = o.trait_type ?? o.traitType ?? o.trait ?? o.name ?? o.key ?? o.type;
        const val = o.value ?? o.val;
        if (t !== undefined && val !== undefined && String(val) !== "") out.push({ trait_type: String(t), value: String(val) });
      }
    }
    return out;
  }
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== null && val !== undefined && typeof val !== "object" && String(val) !== "")
      .map(([k, val]) => ({ trait_type: k, value: String(val) }));
  }
  return [];
}

function rowFromObject(o: Record<string, unknown>, fallbackKey?: string): RowInfo | null {
  let key = "";
  for (const f of KEY_FIELDS) {
    if (o[f] !== undefined && o[f] !== null && String(o[f]).trim() !== "") {
      key = String(o[f]);
      break;
    }
  }
  if (!key && fallbackKey) key = fallbackKey;
  if (!key && typeof o.name === "string") key = o.name;
  if (!key) return null;

  const attributes = attrsFromUnknown(o.attributes ?? o.traits);
  if (attributes.length === 0 && o.attributes === undefined && o.traits === undefined) {
    // flat record: {"file":"1.png","Color":"Red"} -> remaining simple fields are traits
    for (const [k, val] of Object.entries(o)) {
      if (RESERVED.has(k) || val === null || val === undefined || typeof val === "object" || String(val) === "") continue;
      attributes.push({ trait_type: k, value: String(val) });
    }
  }
  const row: RowInfo = { key, attributes };
  if (typeof o.name === "string" && o.name !== key) row.name = o.name;
  if (typeof o.description === "string") row.description = o.description;
  return row;
}

export function parseJsonAttributes(text: string, filename = ""): ParseResult {
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (e) {
    return { rows: [], format: "json", warnings: [`${filename || "JSON file"} isn't valid JSON: ${e instanceof Error ? e.message : "parse error"}`] };
  }
  const rows: RowInfo[] = [];
  const fileStem = filename.replace(/\.json$/i, "");

  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      if (item && typeof item === "object") {
        const r = rowFromObject(item as Record<string, unknown>);
        if (r) rows.push(r);
        else warnings.push(`Item ${i + 1} has no file name / id, skipped.`);
      }
    });
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const looksSingle = "attributes" in o || KEY_FIELDS.some((f) => f in o);
    if (looksSingle) {
      const r = rowFromObject(o, fileStem || undefined);
      if (r) rows.push(r);
    } else {
      // map form: { "1.png": {"Color":"Red"} | [{trait_type,value}] | {attributes:[…]} }
      for (const [k, v] of Object.entries(o)) {
        if (Array.isArray(v)) rows.push({ key: k, attributes: attrsFromUnknown(v) });
        else if (v && typeof v === "object") {
          const inner = v as Record<string, unknown>;
          if ("attributes" in inner || "traits" in inner) {
            const r = rowFromObject(inner, k);
            if (r) rows.push({ ...r, key: k });
          } else rows.push({ key: k, attributes: attrsFromUnknown(inner) });
        }
      }
    }
  }
  if (rows.length === 0) warnings.push("No attribute rows found in the JSON file.");
  return { rows, format: "json", warnings };
}

// ------------------------------------------------------------------ XML
const XML_KEY_TAGS = ["file", "filename", "image", "id", "name", "tokenid"];

export function parseXmlAttributes(text: string): ParseResult {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(text.replace(/^\uFEFF/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { rows: [], format: "xml", warnings: ["The XML file isn't well-formed."] };
  }
  const root = doc.documentElement;
  let list = Array.from(root.children);
  if (
    list.length === 1 &&
    list[0].attributes.length === 0 &&
    list[0].children.length > 0 &&
    Array.from(list[0].children).every((c) => c.tagName === list[0].children[0].tagName && (c.children.length > 0 || c.attributes.length > 0))
  ) {
    list = Array.from(list[0].children); // <root><items><item/>…</items></root>
  }
  const rows: RowInfo[] = [];
  list.forEach((rec, i) => {
    const kids = Array.from(rec.children);
    let key = "";
    for (const a of ["file", "filename", "image", "id", "name"]) {
      const v = rec.getAttribute(a);
      if (v && v.trim()) {
        key = v.trim();
        break;
      }
    }
    if (!key) {
      for (const t of XML_KEY_TAGS) {
        const el = kids.find((k) => k.tagName.toLowerCase() === t);
        if (el && (el.textContent ?? "").trim()) {
          key = (el.textContent ?? "").trim();
          break;
        }
      }
    }
    if (!key && kids[0]) key = (kids[0].textContent ?? "").trim();
    if (!key) {
      warnings.push(`Record ${i + 1} has no file name, skipped.`);
      return;
    }
    const row: RowInfo = { key, attributes: [] };
    const nameEl = kids.find((k) => k.tagName.toLowerCase() === "name");
    const descEl = kids.find((k) => k.tagName.toLowerCase() === "description");
    if (nameEl && (nameEl.textContent ?? "").trim() && (nameEl.textContent ?? "").trim() !== key) row.name = (nameEl.textContent ?? "").trim();
    if (descEl && (descEl.textContent ?? "").trim()) row.description = (descEl.textContent ?? "").trim();

    for (const child of kids) {
      const tag = child.tagName.toLowerCase();
      if (XML_KEY_TAGS.includes(tag) || tag === "description") continue;
      if (tag === "attributes" || tag === "traits") {
        for (const g of Array.from(child.children)) {
          const t = g.getAttribute("trait_type") || g.getAttribute("name") || g.getAttribute("type") || g.tagName;
          const v = g.getAttribute("value") ?? (g.textContent ?? "").trim();
          if (t && v) row.attributes.push({ trait_type: t, value: v });
        }
      } else {
        const v = (child.textContent ?? "").trim();
        if (v && child.children.length === 0) row.attributes.push({ trait_type: child.tagName, value: v });
      }
    }
    for (const a of Array.from(rec.attributes)) {
      if (["file", "filename", "image", "id", "name"].includes(a.name.toLowerCase()) || !a.value) continue;
      row.attributes.push({ trait_type: a.name, value: a.value });
    }
    rows.push(row);
  });
  if (rows.length === 0) warnings.push("No attribute records found in the XML file.");
  return { rows, format: "xml", warnings };
}

// ------------------------------------------------------------------ entry + mapping
export function isDataFile(f: File): boolean {
  return /\.(csv|json|xml)$/i.test(f.name);
}

export async function parseAttributeFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  if (/\.csv$/i.test(file.name)) return parseCsvAttributes(text);
  if (/\.json$/i.test(file.name)) return parseJsonAttributes(text, file.name);
  if (/\.xml$/i.test(file.name)) return parseXmlAttributes(text);
  return { rows: [], format: "csv", warnings: [`Unsupported file type: ${file.name}`] };
}

export type MappingReport = {
  perImage: (RowInfo | null)[]; // aligned with the image list you passed in
  matched: number;
  unmatchedRows: string[]; // column-1 values that matched no image
  imagesWithoutRow: number;
  byOrder: boolean; // true when column 1 matched nothing and rows were mapped by position instead
};

/// Connect attribute rows to images. `imageNames` must be in final token order.
export function mapRowsToImages(imageNames: string[], rows: RowInfo[]): MappingReport {
  const byStem = new Map<string, number>();
  const byNumber = new Map<string, number>();
  imageNames.forEach((n, i) => {
    const s = stemOf(n);
    if (!byStem.has(s)) byStem.set(s, i);
    if (/^\d+$/.test(s) && !byNumber.has(String(Number(s)))) byNumber.set(String(Number(s)), i);
  });

  const perImage: (RowInfo | null)[] = imageNames.map(() => null);
  const unmatchedRows: string[] = [];
  let matched = 0;

  for (const row of rows) {
    const k = stemOf(row.key);
    let idx = byStem.get(k);
    if (idx === undefined && /^\d+$/.test(k)) idx = byNumber.get(String(Number(k)));
    if (idx === undefined) {
      unmatchedRows.push(row.key);
      continue;
    }
    if (perImage[idx] === null) matched++;
    perImage[idx] = row; // a later duplicate row wins
  }

  // Nothing matched by name but the counts line up: map by position (and say so).
  if (matched === 0 && rows.length > 0 && rows.length === imageNames.length) {
    rows.forEach((r, i) => (perImage[i] = r));
    return { perImage, matched: rows.length, unmatchedRows: [], imagesWithoutRow: 0, byOrder: true };
  }

  return { perImage, matched, unmatchedRows, imagesWithoutRow: perImage.filter((x) => x === null).length, byOrder: false };
}

export const CSV_TEMPLATE = "filename,name,Background,Eyes,Rarity\n1.png,My Collection #1,Purple,Laser,Rare\n2.png,My Collection #2,Black,Sleepy,Common\n";
