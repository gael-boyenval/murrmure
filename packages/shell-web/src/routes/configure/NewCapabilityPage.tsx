import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";

export function NewCapabilityPage({ spaceId }: { spaceId: string }) {
  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>New flow</h1>
      <p>Author workflows in your own repo using the Flow Dev Kit (FDK).</p>
      <ol>
        <li>
          <code>npm install -g @murrmure/cli</code> (or add as devDependency)
        </li>
        <li>
          <code>npm install @murrmure/flow-dev-kit</code>
        </li>
        <li>
          <code>mrmr flow init my-flow --dir ./workflows/my-flow</code>
        </li>
        <li>Edit contract, UI, and server in your IDE</li>
        <li>
          <code>mrmr flow validate .</code> → <code>build .</code> →{" "}
          <code>mrmr flow push --space {spaceId}</code>
        </li>
        <li>Complete evolution in Configure (validate → test → promote → apply)</li>
      </ol>
      <p>
        Register project path in <code>~/.murrmure/hubs/shared.json</code> under{" "}
        <code>flowProjects</code> for <code>mrmr flow dev</code>.
      </p>
      <Link to={`/configure/spaces/${spaceId}/capabilities`}>← Back to flows</Link>
    </ShellLayout>
  );
}
