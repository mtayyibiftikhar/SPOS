export function shouldShowGlobalSaveFeedback(pathname: string) {
  return !(
    pathname === "/billing" ||
    /^\/bills\/[^/]+/.test(pathname) ||
    /^\/refunds\/[^/]+/.test(pathname)
  );
}
