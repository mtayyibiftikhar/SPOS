const baseUrl = process.argv[2] || "http://localhost:3187";

const pageRoutes = [
  "/", "/login", "/dashboard", "/billing", "/customers", "/products",
  "/inventory", "/bills", "/refunds", "/reports", "/settings",
  "/settings/shop", "/settings/printers", "/settings/receipt",
  "/settings/day-shift", "/settings/discounts", "/settings/tax",
  "/settings/users", "/settings/trash", "/settings/backup",
  "/settings/support", "/time-clock", "/time-clock/scan", "/owner"
];

const apiTests = [
  { method: "GET", path: "/api/local-state", expected: 404 },
  { method: "GET", path: "/api/local-owner-state", expected: 404 },
  { method: "GET", path: "/api/shop-state", headers: { "x-shop-id": "00000000-0000-4000-8000-000000000000" }, expected: 401 },
  { method: "GET", path: "/api/owner/cloud-summary", expected: 401 },
  { method: "GET", path: "/api/auth/shop-login", expected: 401 },
  { method: "POST", path: "/api/auth/shop-login", body: "{}", contentType: "application/json", expected: 400 },
  { method: "POST", path: "/api/auth/owner-login", body: "{}", contentType: "application/json", expected: 400 },
  { method: "POST", path: "/api/installation/complete", body: "{}", contentType: "application/json", expected: 400 },
  { method: "POST", path: "/api/attendance/session", body: "{}", contentType: "application/json", expected: 401 },
  { method: "GET", path: "/api/attendance/scan?token=invalid", expected: 400 },
  { method: "POST", path: "/api/activation", body: "{}", contentType: "application/json", expected: 400 },
  { method: "POST", path: "/api/uploads", body: "not-multipart", contentType: "text/plain", expected: 400 },
  { method: "DELETE", path: "/api/uploads", body: "not-json", contentType: "application/json", expected: 400 }
];

async function getStatus(test) {
  try {
    const response = await fetch(`${baseUrl}${test.path}`, {
      method: test.method,
      headers: {
        ...(test.headers || {}),
        ...(test.contentType ? { "content-type": test.contentType } : {})
      },
      body: test.body
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}

async function main() {
  const tests = [
    ...pageRoutes.map((path) => ({ method: "GET", path, expected: 200 })),
    ...apiTests
  ];
  const results = [];

  for (const test of tests) {
    results.push({ ...test, status: await getStatus(test) });
  }

  console.table(results.map(({ method, path, status, expected }) => ({ method, path, status, expected })));
  const failed = results.filter((result) => result.status !== result.expected);

  if (failed.length > 0) {
    throw new Error(`${failed.length} production smoke checks failed.`);
  }

  console.log(`Production smoke checks passed: ${results.length}/${results.length}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
