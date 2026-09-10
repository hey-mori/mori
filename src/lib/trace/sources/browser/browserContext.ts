export type BrowserRuntimeProvider = "chrome" | "edge" | "firefox" | "safari" | (string & {});

export type BrowserRuntimeObservation = {
  id: string;
  provider: BrowserRuntimeProvider;
  label: string;
  version?: string;
  observedAt: string;
};

export type BrowserProfileObservation = {
  id: string;
  label?: string;
  identityStatus: "deferred";
};

export type BrowserWindowObservation = {
  id: string;
  runtimeWindowId: string;
  focused: boolean;
  tabIds: string[];
  state?: "normal" | "minimized" | "maximized" | "fullscreen" | "unknown";
  incognito?: boolean;
};

export type BrowserTabObservation = {
  id: string;
  runtimeTabId: string;
  windowId: string;
  active: boolean;
  currentResourceId?: string;
  title?: string;
  pinned?: boolean;
  audible?: boolean;
  status?: "loading" | "complete" | "unknown";
};

export type BrowserUrlDetailPolicy = "origin" | "origin-path" | "full-without-credentials";

export type BrowserResourcePrivacy = {
  urlDetailPolicy: BrowserUrlDetailPolicy;
  titleCaptured: boolean;
  contentCaptured: false;
  queryCaptured: boolean;
  fragmentCaptured: boolean;
  credentialsCaptured: false;
};

export type BrowserResourceObservation = {
  id: string;
  url: string;
  title?: string;
  origin?: string;
  privacy: BrowserResourcePrivacy;
};

export type BrowserContextSnapshot = {
  observedAt: string;
  runtime: BrowserRuntimeObservation;
  profile?: BrowserProfileObservation;
  windows: BrowserWindowObservation[];
  tabs: BrowserTabObservation[];
  resources: BrowserResourceObservation[];
};

export type BrowserContextSnapshotInput = {
  observedAt: string;
  runtime: Omit<BrowserRuntimeObservation, "observedAt"> & { observedAt?: string };
  profile?: BrowserProfileObservation;
  windows: Array<
    Omit<BrowserWindowObservation, "id" | "runtimeWindowId" | "tabIds"> & {
      id?: string;
      runtimeWindowId: string | number;
      tabIds?: Array<string | number>;
    }
  >;
  tabs: Array<
    Omit<BrowserTabObservation, "id" | "runtimeTabId" | "windowId" | "currentResourceId"> & {
      id?: string;
      runtimeTabId: string | number;
      windowId: string | number;
      url?: string;
    }
  >;
  urlDetailPolicy?: BrowserUrlDetailPolicy;
};

export function buildBrowserContextSnapshot(
  input: BrowserContextSnapshotInput,
): BrowserContextSnapshot {
  const resourceByUrl = new Map<string, BrowserResourceObservation>();
  const windowIds = new Map<string, string>();
  for (const window of input.windows) {
    windowIds.set(
      String(window.runtimeWindowId),
      window.id ?? browserWindowId(window.runtimeWindowId),
    );
  }

  const tabs = input.tabs.map((tab) => {
    const resource = tab.url
      ? browserResourceFromUrl({
          url: tab.url,
          title: tab.title,
          policy: input.urlDetailPolicy,
        })
      : null;
    if (resource && !resourceByUrl.has(resource.url)) {
      resourceByUrl.set(resource.url, resource);
    }
    const windowId = windowIds.get(String(tab.windowId)) ?? browserWindowId(tab.windowId);
    return {
      id: tab.id ?? browserTabId(tab.runtimeTabId),
      runtimeTabId: String(tab.runtimeTabId),
      windowId,
      active: tab.active,
      currentResourceId: resource?.id,
      title: tab.title || undefined,
      pinned: tab.pinned,
      audible: tab.audible,
      status: tab.status,
    };
  });

  const tabIdsByWindow = new Map<string, string[]>();
  for (const tab of tabs) {
    const existing = tabIdsByWindow.get(tab.windowId) ?? [];
    existing.push(tab.id);
    tabIdsByWindow.set(tab.windowId, existing);
  }

  const windows = input.windows.map((window) => {
    const id =
      windowIds.get(String(window.runtimeWindowId)) ?? browserWindowId(window.runtimeWindowId);
    return {
      id,
      runtimeWindowId: String(window.runtimeWindowId),
      focused: window.focused,
      tabIds: window.tabIds?.map(browserTabId) ?? tabIdsByWindow.get(id) ?? [],
      state: window.state,
      incognito: window.incognito,
    };
  });

  return {
    observedAt: input.observedAt,
    runtime: {
      ...input.runtime,
      observedAt: input.runtime.observedAt ?? input.observedAt,
    },
    profile: input.profile,
    windows,
    tabs,
    resources: [...resourceByUrl.values()],
  };
}

export function browserResourceFromUrl({
  url,
  title,
  policy = "origin-path",
}: {
  url: string;
  title?: string;
  policy?: BrowserUrlDetailPolicy;
}): BrowserResourceObservation {
  const cleaned = redactBrowserUrl(url, policy);
  return {
    id: browserResourceId(cleaned.url),
    url: cleaned.url,
    title: title?.trim() || undefined,
    origin: cleaned.origin,
    privacy: {
      urlDetailPolicy: policy,
      titleCaptured: Boolean(title?.trim()),
      contentCaptured: false,
      queryCaptured: cleaned.queryCaptured,
      fragmentCaptured: cleaned.fragmentCaptured,
      credentialsCaptured: false,
    },
  };
}

export function redactBrowserUrl(
  rawUrl: string,
  policy: BrowserUrlDetailPolicy = "origin-path",
): { url: string; origin?: string; queryCaptured: boolean; fragmentCaptured: boolean } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: "about:blank", queryCaptured: false, fragmentCaptured: false };
  }

  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    if (policy === "origin") {
      return {
        url: parsed.origin === "null" ? parsed.protocol : parsed.origin,
        origin: parsed.origin === "null" ? undefined : parsed.origin,
        queryCaptured: false,
        fragmentCaptured: false,
      };
    }

    if (policy === "origin-path") {
      parsed.search = "";
      parsed.hash = "";
    }

    return {
      url: parsed.toString(),
      origin: parsed.origin === "null" ? undefined : parsed.origin,
      queryCaptured: policy === "full-without-credentials" && parsed.search.length > 0,
      fragmentCaptured: policy === "full-without-credentials" && parsed.hash.length > 0,
    };
  } catch {
    return {
      url: trimmed.split(/[?#]/, 1)[0] || "about:blank",
      queryCaptured: false,
      fragmentCaptured: false,
    };
  }
}

export function browserWindowId(runtimeWindowId: string | number): string {
  return `browser-window-${stableSuffix(String(runtimeWindowId))}`;
}

export function browserTabId(runtimeTabId: string | number): string {
  return `browser-tab-${stableSuffix(String(runtimeTabId))}`;
}

export function browserResourceId(url: string): string {
  return `browser-resource-${stableSuffix(url)}`;
}

export function stableSuffix(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "").slice(0, 96) || "unknown";
}
