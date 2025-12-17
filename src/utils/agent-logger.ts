import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed';

export interface AgentLog {
  id: string;
  taskId: string;
  agentId: string;
  phase: string;
  step: string;
  status: TaskStatus;
  startedAt: string;
  completedAt?: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
  error?: string;
}

const LOG_DIR = 'logs';
const LOG_FILE = 'agent-progress.jsonl';

export class AgentLogger {
  private logPath: string;
  private agentId: string;

  constructor(agentId?: string) {
    this.agentId = agentId || `agent-${uuidv4().slice(0, 8)}`;
    this.logPath = path.join(process.cwd(), LOG_DIR, LOG_FILE);
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private appendLog(log: AgentLog): void {
    fs.appendFileSync(this.logPath, `${JSON.stringify(log)}\n`);
  }

  readLogs(): AgentLog[] {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }
    const content = fs.readFileSync(this.logPath, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as AgentLog);
  }

  getTaskStatus(taskId: string): AgentLog | undefined {
    const logs = this.readLogs();
    return logs.filter((log) => log.taskId === taskId).pop();
  }

  getCompletedTasks(): string[] {
    const logs = this.readLogs();
    const taskStatuses = new Map<string, TaskStatus>();
    for (const log of logs) {
      taskStatuses.set(log.taskId, log.status);
    }
    return Array.from(taskStatuses.entries())
      .filter(([, status]) => status === 'completed')
      .map(([taskId]) => taskId);
  }

  getAvailableTasks(allTasks: { taskId: string; dependencies: string[] }[]): string[] {
    const completed = new Set(this.getCompletedTasks());
    const inProgress = new Set(
      this.readLogs()
        .filter((log) => log.status === 'in_progress')
        .map((log) => log.taskId)
    );

    return allTasks
      .filter((task) => {
        if (completed.has(task.taskId) || inProgress.has(task.taskId)) {
          return false;
        }
        return task.dependencies.every((dep) => completed.has(dep));
      })
      .map((task) => task.taskId);
  }

  startTask(
    taskId: string,
    phase: string,
    step: string,
    dependencies: string[] = [],
    metadata: Record<string, unknown> = {}
  ): AgentLog {
    const log: AgentLog = {
      id: uuidv4(),
      taskId,
      agentId: this.agentId,
      phase,
      step,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      dependencies,
      metadata
    };
    this.appendLog(log);
    return log;
  }

  completeTask(taskId: string, metadata: Record<string, unknown> = {}): AgentLog {
    const existing = this.getTaskStatus(taskId);
    const log: AgentLog = {
      id: uuidv4(),
      taskId,
      agentId: this.agentId,
      phase: existing?.phase || '',
      step: existing?.step || '',
      status: 'completed',
      startedAt: existing?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      dependencies: existing?.dependencies || [],
      metadata: { ...existing?.metadata, ...metadata }
    };
    this.appendLog(log);
    return log;
  }

  failTask(taskId: string, error: string, metadata: Record<string, unknown> = {}): AgentLog {
    const existing = this.getTaskStatus(taskId);
    const log: AgentLog = {
      id: uuidv4(),
      taskId,
      agentId: this.agentId,
      phase: existing?.phase || '',
      step: existing?.step || '',
      status: 'failed',
      startedAt: existing?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      dependencies: existing?.dependencies || [],
      metadata: { ...existing?.metadata, ...metadata },
      error
    };
    this.appendLog(log);
    return log;
  }

  blockTask(taskId: string, reason: string, metadata: Record<string, unknown> = {}): AgentLog {
    const existing = this.getTaskStatus(taskId);
    const log: AgentLog = {
      id: uuidv4(),
      taskId,
      agentId: this.agentId,
      phase: existing?.phase || '',
      step: existing?.step || '',
      status: 'blocked',
      startedAt: existing?.startedAt || new Date().toISOString(),
      dependencies: existing?.dependencies || [],
      metadata: { ...existing?.metadata, ...metadata, blockReason: reason }
    };
    this.appendLog(log);
    return log;
  }

  getProgress(): {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    failed: number;
  } {
    const logs = this.readLogs();
    const taskStatuses = new Map<string, TaskStatus>();
    for (const log of logs) {
      taskStatuses.set(log.taskId, log.status);
    }

    const statuses = Array.from(taskStatuses.values());
    return {
      total: taskStatuses.size,
      completed: statuses.filter((s) => s === 'completed').length,
      inProgress: statuses.filter((s) => s === 'in_progress').length,
      blocked: statuses.filter((s) => s === 'blocked').length,
      failed: statuses.filter((s) => s === 'failed').length
    };
  }
}

export const agentLogger = new AgentLogger();
