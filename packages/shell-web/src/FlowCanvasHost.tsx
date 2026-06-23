import { useEffect, useRef, useState } from "react";
import { getStoredHubUrl, useClient } from "./hooks.js";
import { getStorageItem } from "./storage.js";
import { ShellLayout } from "./ShellLayout.js";

export interface FlowCanvasHostProps {
  spaceId: string;
  instanceId: string;
  packageId: string;
  version: string;
}

export function FlowCanvasHost({ spaceId, instanceId, packageId, version }: FlowCanvasHostProps) {
  const client = useClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const hubUrl = getStoredHubUrl().replace(/\/$/, "");

  const iframeSrc = `${hubUrl}/flows/${packageId}/${version}/ui/shell.html?instance=${encodeURIComponent(instanceId)}`;

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (ev.data?.type !== "hub-fetch") return;
      const { id, path, init } = ev.data as { id: string; path: string; init?: RequestInit };
      const token = getStorageItem("murrmure_token") ?? "";
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

  useEffect(() => {
    if (!client) return;
    return client.events.subscribe(spaceId, (event, data) => {
      if (event !== "flow.dev_reload" && event !== "flow.dev_reload") return;
      if ((data as { package_id?: string; flow_id?: string } | undefined)?.package_id !== packageId
        && (data as { flow_id?: string } | undefined)?.flow_id !== packageId) return;
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
          flowId: packageId,
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
          {error} · <a href={`/configure/spaces/${spaceId}/flows`}>Configure → flows</a>
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
