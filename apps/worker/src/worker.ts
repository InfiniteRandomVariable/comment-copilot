import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { loadWorkerEnv } from "./env";

loadWorkerEnv();

async function runWorker() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    workflowsPath: new URL("./workflows/commentWorkflow.ts", import.meta.url).pathname,
    activities,
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "comment-copilot"
  });

  await worker.run();
}

runWorker().catch((error) => {
  console.error("Temporal worker failed", error);
  process.exit(1);
});
