// Message-history auto-scroll that never moves anything but the history container itself.
// scrollIntoView() is deliberately not used: it scrolls every scrollable ancestor (and the page), which made the
// whole app shell jump when Messages opened or a message arrived.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const PIN_THRESHOLD = 80; // px from the bottom that still counts as "reading the latest"

export function isNearBottom(el, threshold = PIN_THRESHOLD) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

// Pure decision (unit-tested): what to do after a render.
//  - "jump": a different thread (or the first load) — show its latest message.
//  - "follow": new message(s) and the reader is at the bottom, or the reader just sent one.
//  - "indicate": new message(s) while the reader is looking at older ones — keep their place.
//  - "none": nothing new (polls, re-renders, read receipts).
export function decideScroll({ threadChanged, prevCount, count, pinned, ownSend }) {
  if (threadChanged) return count > 0 ? "jump" : "none";
  if (count <= prevCount) return "none";
  if (ownSend || pinned) return "follow";
  return "indicate";
}

export function scrollToLatest(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

// threadKey: identifies the open conversation; count: messages rendered for it.
export function useMessageScroll(threadKey, count) {
  const containerRef = useRef(null);
  const pinnedRef = useRef(true);
  const ownSendRef = useRef(false);
  const prev = useRef({ key: undefined, count: 0 });
  const [hasNew, setHasNew] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const p = prev.current;
    const threadChanged = p.key !== threadKey || (p.count === 0 && count > 0);
    const action = decideScroll({ threadChanged, prevCount: p.count, count, pinned: pinnedRef.current, ownSend: ownSendRef.current });
    if (action === "jump" || action === "follow") { scrollToLatest(el); pinnedRef.current = true; setHasNew(false); }
    else if (action === "indicate") setHasNew(true);
    if (threadChanged) setHasNew(action === "indicate");
    if (count > p.count) ownSendRef.current = false;
    prev.current = { key: threadKey, count };
  }, [threadKey, count]);

  // Content that grows without a new message (typing indicator, a notice, a wrapped bubble) keeps a reader who is
  // at the bottom pinned there. Only this container's scrollTop is touched.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof MutationObserver === "undefined") return undefined;
    const mo = new MutationObserver(() => { if (pinnedRef.current) scrollToLatest(el); });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [threadKey]);

  const onScroll = useCallback(() => {
    const near = isNearBottom(containerRef.current);
    pinnedRef.current = near;
    if (near) setHasNew(false);
  }, []);

  const markOwnSend = useCallback(() => { ownSendRef.current = true; }, []);
  const jumpToLatest = useCallback(() => { scrollToLatest(containerRef.current); pinnedRef.current = true; setHasNew(false); }, []);

  return { containerRef, onScroll, hasNew, markOwnSend, jumpToLatest };
}
