const HUB_URL = process.env.MURRMURE_HUB_URL ?? "http://127.0.0.1:8787";
const TOKEN = process.env.MURRMURE_HUB_TOKEN ?? process.env.MURRMURE_TOKEN ?? "";

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };
}

export async function runHubCommand(command: string, rest: string[]): Promise<void> {
  if (command === "health") {
    const res = await fetch(`${HUB_URL}/v1/health`);
    console.log(JSON.stringify(await res.json()));
    return;
  }

  if (command === "events") {
    const spaceId = rest[0];
    const fromSeq = rest[1] ?? "0";
    const res = await fetch(`${HUB_URL}/v1/spaces/${spaceId}/events?from_seq=${fromSeq}`, {
      headers: authHeaders(),
    });
    console.log(JSON.stringify(await res.json()));
    return;
  }

  if (command === "gates") {
    const spaceId = rest[0];
    const res = await fetch(`${HUB_URL}/v1/spaces/${spaceId}/gates`, {
      headers: authHeaders(),
    });
    console.log(JSON.stringify(await res.json()));
    return;
  }

  if (command === "transition") {
    const [spaceId, instanceId, event, revision] = rest;
    const res = await fetch(
      `${HUB_URL}/v1/spaces/${spaceId}/instances/${instanceId}/transitions`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ event, expected_revision: Number(revision) }),
      },
    );
    console.log(JSON.stringify(await res.json()));
    return;
  }

  if (command === "wait") {
    const [spaceId, waitId] = rest;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const res = await fetch(`${HUB_URL}/v1/spaces/${spaceId}/waits/${waitId}`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as { status?: string };
      if (body.status !== "pending") {
        console.log(JSON.stringify(body));
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(JSON.stringify({ status: "timed_out", wait_id: waitId }));
    return;
  }

  if (command === "audit" && rest[0] === "export") {
    const spaceId = rest[1];
    const since = rest[2] ?? "0";
    const res = await fetch(`${HUB_URL}/v1/spaces/${spaceId}/audit/export?since=${since}`, {
      headers: authHeaders(),
    });
    console.log(await res.text());
    return;
  }

  console.log(JSON.stringify({ error: "unknown_command", command }));
  process.exit(1);
}
