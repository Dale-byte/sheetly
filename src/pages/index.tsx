import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  clearConfig,
  errMsg,
  fetchDataFile,
  loadConfig,
  saveConfig,
  testConnection,
  writeDataFile,
  type GitHubConfig,
} from "@/lib/github-store";
import { Backups } from "@/components/Backups";
import { InstallPrompt } from "@/components/InstallPrompt";

// The budget app stores under the same-origin localStorage key below. Read as
// a fallback so an empty cloud can never wipe a device that has local data.
function localBudgetData(): string {
  try {
    return localStorage.getItem("sheetly_data") || "";
  } catch {
    return "";
  }
}

export function IndexPage() {
  const [cfg, setCfg] = useState<GitHubConfig | null>(() => loadConfig());

  if (!cfg) {
    return (
      <ConnectScreen
        onConnect={(c) => {
          saveConfig(c);
          setCfg(c);
        }}
      />
    );
  }
  return (
    <BudgetFrame
      cfg={cfg}
      onDisconnect={() => {
        clearConfig();
        setCfg(null);
      }}
    />
  );
}

function ConnectScreen({ onConnect }: { onConnect: (cfg: GitHubConfig) => void }) {
  const [owner, setOwner] = useState("Dale-byte");
  const [repo, setRepo] = useState("sheetly-data");
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const cfg: GitHubConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      token: token.trim(),
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      setErr("Owner, repo and token are all required.");
      return;
    }
    setLoading(true);
    try {
      const info = await testConnection(cfg);
      if (!info.isPrivate) {
        setErr("That repo is public. Use a private repo so your budget stays private.");
        return;
      }
      setOk(`Connected to ${info.owner}/${info.repo}`);
      onConnect(cfg);
    } catch (e: unknown) {
      setErr(errMsg(e, "Connection failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f1419",
        padding: 16,
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#1f2937",
          color: "#f3f4f6",
          padding: 24,
          borderRadius: 12,
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 10px 30px rgba(0,0,0,.3)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, marginBottom: 4 }}>Sheetly</h1>
        <p style={{ margin: 0, marginBottom: 16, color: "#9ca3af", fontSize: 14 }}>
          Connect a private GitHub repo to store and sync your budget.
        </p>
        <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Owner</label>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          style={inputStyle}
          autoComplete="off"
        />
        <label style={{ display: "block", fontSize: 13, marginBottom: 6, marginTop: 12 }}>
          Private repo name
        </label>
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          style={inputStyle}
          autoComplete="off"
        />
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 12 }}>
          The repo must already exist. Create a private one at{" "}
          <a
            href="https://github.com/new"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#93c5fd" }}
          >
            github.com/new
          </a>{" "}
          first if needed.
        </p>
        <label style={{ display: "block", fontSize: 13, marginBottom: 6, marginTop: 12 }}>
          Fine-grained personal access token
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={inputStyle}
          autoComplete="off"
        />
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 12 }}>
          Create one at{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#93c5fd" }}
          >
            github.com/settings/personal-access-tokens/new
          </a>{" "}
          with <strong>Contents: Read and write</strong> on that repo only. The token is stored in
          this browser only - anyone who has it can read or change your budget.
        </p>
        {err && <div style={{ color: "#fca5a5", fontSize: 13, marginTop: 12 }}>{err}</div>}
        {ok && <div style={{ color: "#86efac", fontSize: 13, marginTop: 12 }}>{ok}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "10px 14px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 15,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Checking…" : "Connect"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #374151",
  background: "#111827",
  color: "#f3f4f6",
  fontSize: 15,
  boxSizing: "border-box",
};

function BudgetFrame({ cfg, onDisconnect }: { cfg: GitHubConfig; onDisconnect: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const snapshotRef = useRef<string>("");
  const lastSentRef = useRef<string>("");
  const lastWriteAtRef = useRef<number>(0);
  const helloPendingRef = useRef(false);

  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [status, setStatus] = useState<"syncing" | "synced" | "error">("synced");

  // Load the snapshot from the GitHub repo once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let content = "";
      try {
        const file = await fetchDataFile(cfg);
        if (cancelled) return;
        if (file) {
          content = file.content;
        } else {
          // Empty cloud: don't let it wipe this device's local data. Prefer
          // local, and push it up so the repo is seeded from this device.
          const seed = localBudgetData();
          if (seed) {
            content = seed;
            try {
              await writeDataFile(cfg, seed, undefined, "Initial upload from this device");
            } catch (e) {
              console.error("Failed to upload initial local data to GitHub", e);
            }
          }
        }
      } catch (e) {
        if (cancelled) return;
        // Transient error talking to GitHub: fall back to local rather than
        // sending an empty snapshot that would wipe this device's data.
        console.error("Failed to load snapshot from GitHub, using local data", e);
        content = localBudgetData();
      }
      if (cancelled) return;
      snapshotRef.current = content;
      lastSentRef.current = content;
      setSnapshotLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg]);

  // Handle messages from the iframe (init / save) and write back to GitHub.
  useEffect(() => {
    function send(type: string, payload: unknown) {
      iframeRef.current?.contentWindow?.postMessage({ source: "sheetly-host", type, payload }, "*");
    }

    let chain: Promise<unknown> = Promise.resolve();
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    function queueWrite(content: string) {
      setStatus("syncing");
      chain = chain
        .catch(() => {})
        .then(async () => {
          try {
            const current = await fetchDataFile(cfgRef.current);
            const curContent = current?.content ?? "";
            if (curContent === content) {
              setStatus("synced");
              return;
            }
            lastWriteAtRef.current = Date.now();
            await writeDataFile(cfgRef.current, content, current?.sha);
            setStatus("synced");
          } catch (e: unknown) {
            console.error("GitHub save failed", e);
            if (e instanceof ApiError && e.status === 409) {
              try {
                const current = await fetchDataFile(cfgRef.current);
                lastWriteAtRef.current = Date.now();
                await writeDataFile(cfgRef.current, content, current?.sha);
                setStatus("synced");
              } catch (e2: unknown) {
                console.error("GitHub save retry failed", e2);
                setStatus("error");
              }
            } else {
              setStatus("error");
            }
          }
        });
    }

    function onMsg(e: MessageEvent) {
      const msg = e.data;
      if (!msg || msg.source !== "sheetly") return;
      if (msg.type === "hello") {
        if (snapshotLoaded) {
          send("init", snapshotRef.current);
        } else {
          helloPendingRef.current = true;
        }
      } else if (msg.type === "save") {
        const value: string = msg.payload || "";
        if (value === lastSentRef.current) return;
        lastSentRef.current = value;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => queueWrite(value), 1000);
      }
    }
    window.addEventListener("message", onMsg);
    // If iframe said hello before the snapshot was ready, respond now.
    if (snapshotLoaded && helloPendingRef.current) {
      helloPendingRef.current = false;
      send("init", snapshotRef.current);
    }
    return () => {
      window.removeEventListener("message", onMsg);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [snapshotLoaded]);

  // Poll for changes made on other devices and reload the iframe.
  useEffect(() => {
    if (!snapshotLoaded) return;
    async function check() {
      let incoming = "";
      try {
        const current = await fetchDataFile(cfgRef.current);
        incoming = current?.content ?? "";
      } catch (e: unknown) {
        if (!(e instanceof ApiError) || e.status !== 404) console.error("Sync poll failed", e);
        return;
      }
      // Never let an empty cloud wipe a device that still has local data.
      if (!incoming) incoming = localBudgetData();
      if (incoming === lastSentRef.current) return; // no change / own echo
      // Never reload right after we wrote - that would blow away whatever
      // the user is currently typing.
      if (Date.now() - lastWriteAtRef.current < 20000) {
        snapshotRef.current = incoming;
        return;
      }
      lastSentRef.current = incoming;
      snapshotRef.current = incoming;
      iframeRef.current?.contentWindow?.postMessage(
        { source: "sheetly-host", type: "reload" },
        "*",
      );
    }
    const id = setInterval(check, 30000);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [snapshotLoaded]);

  const [tab, setTab] = useState<"budget" | "templates" | "backups">("budget");

  function navigateIframe(view: string) {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "sheetly-host", type: "navigate", payload: view },
      "*",
    );
  }

  function reloadFromRemote() {
    fetchDataFile(cfgRef.current)
      .then((current) => {
        const incoming = current?.content ?? "";
        snapshotRef.current = incoming;
        lastSentRef.current = incoming;
        iframeRef.current?.contentWindow?.postMessage(
          { source: "sheetly-host", type: "reload" },
          "*",
        );
      })
      .catch(() => {});
  }

  // Allow the iframe (Settings view) to request switching to the Backups tab.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const msg = e.data;
      if (msg && msg.source === "sheetly" && msg.type === "open-backups") {
        setTab("backups");
      }
      if (msg && msg.source === "sheetly" && msg.type === "open-templates") {
        setTab("templates");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0f1419",
      }}
    >
      <style>{`
        .bb-topbar{display:flex;align-items:center;justify-content:space-between;gap:8px;
          padding:6px 12px;background:#0f1419;color:#9ca3af;font-size:12px;
          border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:nowrap;}
        .bb-tabs{display:flex;gap:4px;min-width:0;}
        .bb-tabs button{white-space:nowrap;}
        .bb-right{display:flex;align-items:center;gap:10px;flex-shrink:0;white-space:nowrap;}
        .bb-sync{white-space:nowrap;}
        .bb-install{background:#3b82f6;color:white;border:none;border-radius:4px;
          padding:3px 10px;cursor:pointer;font-size:12px;white-space:nowrap;}
        .bb-signout{background:transparent;color:#93c5fd;border:1px solid #374151;
          border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;white-space:nowrap;}
        @media (max-width: 560px){
          .bb-topbar{padding:6px 8px;gap:6px;}
          .bb-tabs{gap:2px;}
          .bb-tabs button{padding:4px 8px !important;font-size:12px !important;}
          .bb-sync{font-size:11px;}
          .bb-sync span{display:none;}
          .bb-install{padding:3px 8px;font-size:11px;}
          .bb-signout{padding:3px 8px;font-size:11px;}
        }
      `}</style>
      <div className="bb-topbar">
        <div className="bb-tabs">
          <button
            onClick={() => {
              setTab("budget");
              navigateIframe("dashboard");
            }}
            style={tabBtn(tab === "budget")}
          >
            Budget
          </button>
          <button
            onClick={() => {
              setTab("templates");
              navigateIframe("templates");
            }}
            style={tabBtn(tab === "templates")}
          >
            Templates
          </button>
          <button onClick={() => setTab("backups")} style={tabBtn(tab === "backups")}>
            Backups
          </button>
        </div>
        <div className="bb-right">
          <InstallPrompt />
          <span className="bb-sync" title={`${cfg.owner}/${cfg.repo}`}>
            ●{" "}
            <span>
              {status === "error"
                ? "Sync failed"
                : status === "syncing"
                  ? "Syncing…"
                  : "Synced to GitHub"}
            </span>
          </span>
          <button className="bb-signout" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
      <div
        style={{ flex: 1, position: "relative", overflow: tab === "backups" ? "auto" : "hidden" }}
      >
        <iframe
          ref={iframeRef}
          src={import.meta.env.BASE_URL + "budget/index.html"}
          title="Sheetly"
          style={{
            border: "none",
            width: "100%",
            height: "100%",
            display: tab === "backups" ? "none" : "block",
          }}
        />
        {tab === "backups" && <Backups cfg={cfg} onReload={reloadFromRemote} />}
      </div>
    </div>
  );
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "#1f2937" : "transparent",
  color: active ? "#f3f4f6" : "#9ca3af",
  border: "1px solid " + (active ? "#374151" : "transparent"),
  borderRadius: 4,
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: 13,
});
