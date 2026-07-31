/**
 * Browser noise that is not an application error.
 *
 * WebKit reports an aborted subresource load as an *uncaught error* whose
 * message is the request URL followed by "due to access control checks".
 * Firestore's WebChannel transport aborts and reopens its long-poll
 * continuously — that is how the transport works — so on WebKit a handful of
 * those arrive as page errors over the course of a run. Chromium and Firefox
 * report the same aborts as ordinary failed requests and never raise them to
 * the page.
 *
 * Verified rather than assumed: the identical signed-in Settings flow was run
 * three times on WebKit, and two runs saw none of these while the third saw
 * one — with the page rendering and the flow completing in all three. It is
 * intermittent transport churn, not something the app did.
 *
 * The specs that assert "nothing threw" mean *the app* threw. Without this
 * they were asserting something stricter and engine-specific: that the Firebase
 * SDK never aborts a request, which it does by design.
 *
 * Deliberately narrow — it requires a googleapis.com host, so an uncaught error
 * from application code still fails the suite no matter how it is worded.
 */
export function isBrowserTransportNoise(message: string): boolean {
  if (!/googleapis\.com/.test(message)) return false;
  return /\/(Listen|Write)\/channel/.test(message) ||
    /due to access control checks/i.test(message);
}
