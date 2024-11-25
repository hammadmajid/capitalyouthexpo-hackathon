// ONB-001 / SEC: the app shell loads as a new document after authentication so it receives the
// app Content-Security-Policy (client navigation would keep the public page's stricter policy).
export function enterApp(path: string) {
  window.location.assign(path);
}
