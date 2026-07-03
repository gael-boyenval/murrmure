import * as p from "@clack/prompts";

export async function confirmStep(message: string, options?: { yes?: boolean }): Promise<boolean> {
  if (options?.yes) {
    return true;
  }
  const answer = await p.confirm({ message, initialValue: true });
  if (p.isCancel(answer)) {
    p.cancel("Setup cancelled — partial progress saved");
    process.exit(0);
  }
  return Boolean(answer);
}

export async function promptText(
  message: string,
  options: {
    placeholder?: string;
    defaultValue?: string;
    validate?: (value: string | undefined) => string | undefined;
  },
): Promise<string> {
  const answer = await p.text({
    message,
    placeholder: options.placeholder,
    defaultValue: options.defaultValue,
    validate: options.validate,
  });
  if (p.isCancel(answer)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }
  return String(answer).trim();
}

export async function promptPassword(
  message: string,
  validate?: (value: string | undefined) => string | undefined,
): Promise<string> {
  const answer = await p.password({ message, validate });
  if (p.isCancel(answer)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }
  return String(answer);
}
