/**
 * A queue to execute asynchronous commands sequentially per room.
 * Supports priority insertion (jumping to the front of the line)
 * and clearing the queue (e.g. on pause/stop).
 */
class CommandQueue {
  constructor() {
    this.tasks = [];
    this.running = false;
  }

  /**
   * Enqueues a task (an async function).
   * @param {Function} fn - The async function to execute.
   * @param {boolean} priority - If true, inserts at the front of the queue.
   * @returns {Promise<any>} A promise that resolves when the task finishes.
   */
  enqueue(fn, priority = false) {
    return new Promise((resolve, reject) => {
      const task = { fn, resolve, reject };
      
      if (priority) {
        // Place at the very front of the queue so it runs next
        this.tasks.unshift(task);
      } else {
        // Queue at the end
        this.tasks.push(task);
      }

      this.process();
    });
  }

  /**
   * Processes the next task in the queue.
   */
  async process() {
    if (this.running) {
      return;
    }

    if (this.tasks.length === 0) {
      this.running = false;
      return;
    }

    this.running = true;
    const task = this.tasks.shift();

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      this.running = false;
      // Process next tick to avoid recursion stack growth
      setImmediate(() => this.process());
    }
  }

  /**
   * Clears all pending tasks in the queue, rejecting their promises.
   */
  clear() {
    const pending = this.tasks;
    this.tasks = [];
    for (const task of pending) {
      task.reject(new Error('Queue cleared due to immediate command (Pause/Stop)'));
    }
  }
}

module.exports = CommandQueue;
