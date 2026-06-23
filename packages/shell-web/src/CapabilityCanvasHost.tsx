import { useEffect, useRef, useState } from "react";
import { useClient } from "./hooks.js";
import { ShellLayout } from "./ShellLayout.js";

export interface CapabilityCanvasHostProps {
  spaceId: string;
  instanceId: string;
  packageId: string;
  version: string;
}

export function CapabilityCanvasHost({ spaceId, instanceId, packageId, version }: CapabilityCanvasHostProps) {
  const client = useClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const hubUrl = (() => {
    const stored = localStorage.getItem("studio_hub_url") ?? "http://127.0.0.1:8787";
    return stored.replace(/\/$/, "");
  })();

  const iframeSrc = `${hubUrl}/capabilities/${packageId}/${version}/ui/shell.html?instance=${encodeURIComponent(instanceId)}`;

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (ev.data?.type !== "hub-fetch") return;
      const { id, path, init } = ev.data as { id: string; path: string; init?: RequestInit };
      const token = localStorage.getItem("studio_token") ?? "";
      void fetch(`${hubUrl}${path}`, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
        },
      })
        .then(async (res) => {
          const text = await res.text();
          iframeRef.current?.contentWindow?.postMessage(
            { type: "hub-fetch-result", id, ok: res.ok, status: res.status, body: text },
            "*",
          );
        })
        .catch((e) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "hub-fetch-result", id, ok: false, error: String(e) },
            "*",
          );
        });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hubUrl]);

  useEffect(() => {
    if (!client) return;
    void fetch(iframeSrc, { method: "HEAD" })
      .then((res) => {
        if (!res.ok) setError("UI bundle missing — run apply in Configure");
      })
      .catch(() => setError("Cannot reach hub UI bundle"));
  }, [client, iframeSrc]);

  // BC5 dev loop: hot-reload the iframe when the hub re-applies this capability.
  useEffect(() => {
    if (!client) return;
    return client.events.subscribe(spaceId, (event, data) => {
      if (event !== "capability.dev_reload") return;
      if ((data as { package_id?: string } | undefined)?.package_id !== packageId) return;
      iframeRef.current?.contentWindow?.postMessage({ type: "reload" }, "*");
    });
  }, [client, spaceId, packageId]);

  const onLoad = () => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "init",
        ctx: {
          spaceId,
          instanceId,
          hubUrl,
          packageId,
          version,
          canvasRoute: `/spaces/${spaceId}/instances/${instanceId}/canvas/${packageId}`,
        },
      },
      "*",
    );
  };

  return (
    <ShellLayout mode="runtime" spaceId={spaceId}>
      {error && (
        <div style={{ padding: 12, background: "#fee", marginBottom: 8 }}>
          {error} · <a href={`/configure/spaces/${spaceId}/capabilities`}>Configure → capabilities</a>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={`${packageId} canvas`}
        src={iframeSrc}
        sandbox="allow-scripts"
        onLoad={onLoad}
        style={{ width: "100%", height: "calc(100vh - 120px)", border: "1px solid #ddd" }}
      />
    </ShellLayout>
  );
}
