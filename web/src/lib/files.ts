// The bucket listing and small helpers shared by the pages.

export interface FileEntry {
  path: string;
  size: number;
}

export interface Listing {
  count: number;
  /** Origin the files are served from, e.g. https://raw.doughmination.gay */
  raw: string;
  files: FileEntry[];
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function fetchList(fresh = false): Promise<Listing> {
  const res = await fetch("/api/list", { cache: fresh ? "no-store" : "no-cache" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

export async function fetchMe(): Promise<{ username: string } | null> {
  try {
    return await (await fetch("/api/me")).json();
  } catch {
    return null;
  }
}

/** A write to the API (sign-in is checked there); an error message, or null when it worked. */
export async function apiWrite(method: "POST" | "DELETE", url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method });
    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.error || `Failed (${res.status}).`;
  } catch {
    return "Network error.";
  }
}

/** Every folder in the listing, e.g. "img" and "img/avatars". */
export function allFolders(files: FileEntry[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return [...dirs].sort();
}

export function copyText(button: HTMLButtonElement, text: string) {
  navigator.clipboard?.writeText(text).then(() => {
    const was = button.textContent;
    button.textContent = "copied";
    setTimeout(() => (button.textContent = was), 1200);
  });
}
