/***************************************************************
<MODULE_CONTRACT>
<purpose>Facilitates task scheduling and processing in a non-blocking manner, optimizing idle time for execution.</purpose>
<non-goals>
  <item>Do not handle task prioritization or dependencies between tasks.</item>
  <item>Do not parse raw content or manage data fetching here.</item>
  <item>Do not own transport or configuration orchestration for tasks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
***************************************************************/

// @ai-invariant: This is a high-risk module. Preserve its core logic and minimize external side effects during modification.
// --- Scheduler Start ---
type Task = () => Promise<void> | void;

const taskQueue: Task[] = [];
let isTaskRunnerScheduled = false;
function processTasks(deadline?: { timeRemaining: () => number; didTimeout: boolean }) {
  isTaskRunnerScheduled = false;

  // If no deadline (setTimeout fallback), simulate a budget
  const timeRemaining = deadline ? () => deadline.timeRemaining() : () => 16;

  while (taskQueue.length > 0 && (timeRemaining() > 1 || (deadline?.didTimeout ?? false))) {
    const task = taskQueue.shift();
    if (task) {
      void task();
    }
  }

  if (taskQueue.length > 0) {
    isTaskRunnerScheduled = true;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(processTasks, { timeout: 1000 });
    } else {
      setTimeout(processTasks, 50);
    }
  }
}
export function scheduleTask(task: Task) {
  taskQueue.push(task);
  if (!isTaskRunnerScheduled) {
    isTaskRunnerScheduled = true;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(processTasks, { timeout: 1000 });
    } else {
      setTimeout(processTasks, 50);
    }
  }
} // --- Scheduler End ---
