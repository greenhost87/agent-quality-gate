let activeWorkers: { dispose(): void } | undefined;

export function setActiveWorkers(workers: { dispose(): void } | undefined): void {
  activeWorkers = workers;
}

export function disposeActiveWorkers(): void {
  const workers = activeWorkers;
  if (!workers) {
    return;
  }
  activeWorkers = undefined;
  workers.dispose();
}

const taskDao = {
  start(): void {},
};

export function runDirect(): void {
  taskDao.start();
}

export function runMember(entry: { name: string }): string {
  const name = entry.name;
  return name;
}

export function runDestructure(entry: { name: string }): string {
  const { name } = entry;
  return name;
}
