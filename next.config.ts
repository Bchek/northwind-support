import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Cache Components: pages are a prerendered static shell by default; anything that
  // reads the request (cookies, live AWS data) must opt in by sitting behind <Suspense>.
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Compiles "use workflow" / "use step" directives and mounts the workflow runtime routes
// under /.well-known/workflow.
export default withWorkflow(nextConfig);
