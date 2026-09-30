/**
 * Amplify keeps its configuration on a module-level singleton in @aws-amplify/core.
 * If two copies are bundled, Amplify.configure and fetchAuthSession can bind to
 * different singletons and signed-in players silently get no tokens.
 */
export function assertSingleAmplifyCore(metafile, bundleName) {
  const roots = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const match = input.match(/^(.*node_modules\/@aws-amplify\/core)\//);
    if (match) {
      roots.add(match[1]);
    }
  }
  if (roots.size > 1) {
    throw new Error(
      `${bundleName} bundles ${roots.size} copies of @aws-amplify/core (${[...roots].join(', ')}); dedupe it so Amplify has one singleton.`,
    );
  }
}
