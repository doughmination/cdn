// Path-based routing for the viewer: /img/avatars browses that folder. The
// worker hands every folder path the same index.html, so the app just reads
// location.pathname and keeps it in sync with history.

export const route = $state({ path: location.pathname });

export function navigate(href: string) {
  history.pushState(null, "", href);
  route.path = location.pathname;
  window.scrollTo(0, 0);
}

addEventListener("popstate", () => (route.path = location.pathname));

/** use:link on an <a> navigates in-app instead of reloading the page. */
export function link(node: HTMLAnchorElement) {
  const onclick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(node.getAttribute("href")!);
  };
  node.addEventListener("click", onclick);
  return { destroy: () => node.removeEventListener("click", onclick) };
}
