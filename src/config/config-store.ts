const configStore = new Map<string, unknown>();

export function setConfig<T = unknown>(key: string, value: T): void {
  configStore.set(key, value);
}

export function getConfig<T = unknown>(key: string): T | undefined {
  return configStore.get(key) as T | undefined;
}

export function clearConfig(): void {
  configStore.clear();
}