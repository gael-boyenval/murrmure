import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";

export function NewCapabilityPage({ spaceId }: { spaceId: string }) {
  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>New capability</h1>
      <p>Author workflows in your own repo using the Capability Developer Kit (CDK).</p>
      <ol>
        <li>
          <code>npm install -D @studio/capability-sdk</code>
        </li>
        <li>
          <code>studio capability init my-flow --dir ./workflows/my-flow</code>
        </li>
        <li>Edit contract, UI, and server in your IDE</li>
        <li>
          <code>studio capability validate .</code> → <code>build .</code> →{" "}
          <code>studio capability push --space {spaceId}</code>
        </li>
        <li>Complete evolution in Configure (validate → test → promote → apply)</li>
      </ol>
      <p>
        Register project path in <code>~/.studio/hubs/shared.json</code> under{" "}
        <code>capabilityProjects</code> for <code>studio capability dev</code>.
      </p>
      <Link to={`/configure/spaces/${spaceId}/capabilities`}>← Back to capabilities</Link>
    </ShellLayout>
  );
}
