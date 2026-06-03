const CommandQueue = require('../src/queue');

describe('CommandQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  test('should execute tasks sequentially', async () => {
    const executionOrder = [];

    const task1 = () => new Promise(resolve => setTimeout(() => {
      executionOrder.push('task1');
      resolve('res1');
    }, 30));

    const task2 = () => new Promise(resolve => setTimeout(() => {
      executionOrder.push('task2');
      resolve('res2');
    }, 10));

    const p1 = queue.enqueue(task1);
    const p2 = queue.enqueue(task2);

    const r1 = await p1;
    const r2 = await p2;

    expect(r1).toBe('res1');
    expect(r2).toBe('res2');
    expect(executionOrder).toEqual(['task1', 'task2']);
  });

  test('should support priority task execution (unshift)', async () => {
    const executionOrder = [];

    // Task 1 runs first because it starts immediately
    const task1 = () => new Promise(resolve => setTimeout(() => {
      executionOrder.push('task1');
      resolve();
    }, 30));

    const task2 = () => new Promise(resolve => {
      executionOrder.push('task2');
      resolve();
    });

    const task3 = () => new Promise(resolve => {
      executionOrder.push('task3');
      resolve();
    });

    // Task 4 is priority, it should jump ahead of task 2 and 3
    const task4 = () => new Promise(resolve => {
      executionOrder.push('task4');
      resolve();
    });

    const p1 = queue.enqueue(task1);
    const p2 = queue.enqueue(task2);
    const p3 = queue.enqueue(task3);
    const p4 = queue.enqueue(task4, true); // priority!

    await Promise.all([p1, p2, p3, p4]);

    // Order should be task1 (started immediately), task4 (priority), then task2, task3
    expect(executionOrder).toEqual(['task1', 'task4', 'task2', 'task3']);
  });

  test('should clear queue and reject pending tasks', async () => {
    const task1 = () => new Promise(resolve => setTimeout(() => resolve('res1'), 30));
    const task2 = () => new Promise(resolve => resolve('res2'));
    const task3 = () => new Promise(resolve => resolve('res3'));

    const p1 = queue.enqueue(task1);
    const p2 = queue.enqueue(task2);
    const p3 = queue.enqueue(task3);

    // Catch rejections early to avoid unhandled rejection warnings/errors in the test runner
    p2.catch(() => {});
    p3.catch(() => {});

    // Clear the queue before task 1 finishes
    queue.clear();

    const r1 = await p1; // Task 1 was already running, so it should succeed
    expect(r1).toBe('res1');

    await expect(p2).rejects.toThrow('Queue cleared due to immediate command (Pause/Stop)');
    await expect(p3).rejects.toThrow('Queue cleared due to immediate command (Pause/Stop)');
    expect(queue.tasks.length).toBe(0);
  });
});
