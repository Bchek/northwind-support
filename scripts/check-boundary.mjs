// Smoke test for the Vercel -> AWS boundary.
//   node --env-file=.env.local scripts/check-boundary.mjs
// 1. An unsigned request must be rejected by API Gateway (IAM auth).
// 2. A request signed with credentials obtained via Vercel OIDC -> STS must succeed.
// 3. A customer must not be able to read another customer's order (404, not 403).
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { AwsClient } from "aws4fetch";

const api = process.env.NORTHWIND_API_URL;
const region = process.env.NORTHWIND_AWS_REGION ?? "us-east-1";
let failed = false;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed = true;
};

const unsigned = await fetch(`${api}/customers/C-1001/orders`);
check("unsigned request rejected", unsigned.status === 403, `HTTP ${unsigned.status}`);

const creds = await awsCredentialsProvider({
  roleArn: process.env.NORTHWIND_AWS_ROLE_ARN,
  clientConfig: { region },
})();
const aws = new AwsClient({ ...creds, service: "execute-api", region });

const own = await aws.fetch(`${api}/customers/C-1001/orders`);
const body = await own.json();
check("OIDC-signed request succeeds", own.ok && body.orders?.length > 0, `HTTP ${own.status}, ${body.orders?.length} orders`);

const cross = await aws.fetch(`${api}/orders/NW-10388?customerId=C-1001`);
check("cross-customer order hidden", cross.status === 404, `HTTP ${cross.status}`);

process.exit(failed ? 1 : 0);
