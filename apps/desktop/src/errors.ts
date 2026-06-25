export interface StartupErrorDialog {
  title: string;
  message: string;
  detail?: string;
}

function stringifyCause(cause: unknown): string {
  if (!cause) {
    return "";
  }
  if (cause instanceof Error) {
    return cause.stack ?? cause.message;
  }
  return String(cause);
}

export function formatStartupFailure(message: string, cause?: unknown): string {
  const detail = stringifyCause(cause);
  return detail ? `${message}\n${detail}` : message;
}

export async function reportStartupFailure(
  message: string,
  options: {
    cause?: unknown;
    showDialog?: (dialog: StartupErrorDialog) => Promise<void> | void;
  } = {},
): Promise<void> {
  const detail = stringifyCause(options.cause);
  const formatted = detail ? `${message}\n${detail}` : message;
  console.error(formatted);

  if (options.showDialog) {
    await options.showDialog({
      title: "Murrmure failed to start",
      message,
      detail: detail || undefined,
    });
  }
}
