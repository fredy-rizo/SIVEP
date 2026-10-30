import { runPendingOrdersLifecycle } from "../services/pendingOrdersLifecycle.js";

async function run() {
  const result = await runPendingOrdersLifecycle();
  console.log("Ciclo de vida de pedidos en efectivo completado:", result);
}

run().catch(console.error);
