const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  })
);

const baseUrl = args.get("url") || process.env.LOAD_TEST_URL || "http://127.0.0.1:3000";
const durationSeconds = Number(args.get("duration") || process.env.LOAD_TEST_DURATION_SECONDS || 30);
const concurrency = Number(args.get("concurrency") || process.env.LOAD_TEST_CONCURRENCY || 4);
const paths = String(args.get("paths") || process.env.LOAD_TEST_PATHS || "/login,/inquiry")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
  throw new Error("duration must be at least 1 second");
}

if (!Number.isFinite(concurrency) || concurrency < 1) {
  throw new Error("concurrency must be at least 1");
}

if (paths.length === 0) {
  throw new Error("at least one path is required");
}

const deadline = Date.now() + durationSeconds * 1000;
const results = [];

async function worker(workerId) {
  let index = workerId;
  while (Date.now() < deadline) {
    const path = paths[index % paths.length];
    index += concurrency;
    const startedAt = performance.now();
    try {
      const response = await fetch(new URL(path, baseUrl));
      await response.arrayBuffer();
      results.push({
        ok: response.ok,
        status: response.status,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      results.push({
        ok: false,
        status: 0,
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));

const sortedDurations = results.map((result) => result.durationMs).sort((a, b) => a - b);
const percentile = (p) => {
  if (sortedDurations.length === 0) return 0;
  const index = Math.min(sortedDurations.length - 1, Math.ceil((p / 100) * sortedDurations.length) - 1);
  return sortedDurations[index];
};

const failures = results.filter((result) => !result.ok);
const requestsPerSecond = results.length / durationSeconds;

const summary = {
  baseUrl,
  paths,
  durationSeconds,
  concurrency,
  totalRequests: results.length,
  failedRequests: failures.length,
  requestsPerSecond: Number(requestsPerSecond.toFixed(2)),
  p50Ms: Number(percentile(50).toFixed(1)),
  p95Ms: Number(percentile(95).toFixed(1)),
  p99Ms: Number(percentile(99).toFixed(1)),
  statusCounts: results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {}),
};

console.log(JSON.stringify(summary, null, 2));

const maxFailureRate = Number(process.env.LOAD_TEST_MAX_FAILURE_RATE ?? 0.01);
const failureRate = results.length === 0 ? 1 : failures.length / results.length;
if (failureRate > maxFailureRate) {
  console.error(`Load test failed: failure rate ${failureRate.toFixed(3)} exceeded ${maxFailureRate}`);
  process.exit(1);
}
