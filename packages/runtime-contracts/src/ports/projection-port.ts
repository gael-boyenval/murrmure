import type { JournalEntry } from "../types/journal-entry.js";

export interface ProjectionContext {
  getState<T>(key: string): Promise<T | undefined>;
  setState<T>(key: string, value: T): Promise<void>;
}

export interface ProjectionHandlerPort {
  name: string;
  apply(entry: JournalEntry, ctx: ProjectionContext): Promise<void>;
}

export interface ProjectionPort {
  register(handler: ProjectionHandlerPort): void;
  dispatch(entry: JournalEntry): Promise<void>;
  rebuild(name: string, from_seq: number): Promise<void>;
  get(name: string, key: string): Promise<unknown>;
}
