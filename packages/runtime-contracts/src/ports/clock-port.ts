export interface IdPort {
  ulid(): string;
}

export interface ClockPort {
  nowIso(): string;
}
