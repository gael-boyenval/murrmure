import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { StepArtifactSlot } from "./entities/step-contract.js";

export const APPROVED_JSON_SCHEMA_FORMATS = [
  "date",
  "time",
  "date-time",
  "duration",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uuid",
  "uri",
  "uri-reference",
] as const;

export interface ContractValidationError {
  source: "payload" | "artifact";
  path: string;
  rule: string;
  message: string;
}

export interface ContractValidationFailure {
  code: "CONTRACT_VALIDATION_FAILED";
  errors: ContractValidationError[];
}

export interface ArtifactFileMetadata {
  name: string;
  media_type: string;
  size_bytes: number;
}

export interface BranchValidationContract {
  schema?: Record<string, unknown>;
  payload_required?: string[];
  artifact_required?: string[];
  artifact_slots?: Record<string, StepArtifactSlot>;
}

export interface BranchValidationInput {
  payload?: Record<string, unknown>;
  files?: Record<string, ArtifactFileMetadata | ArtifactFileMetadata[]>;
}

export function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function partitionRequiredFields(
  schema: Record<string, unknown> | undefined,
  artifactSlots: Record<string, StepArtifactSlot> | undefined,
): { payload_required: string[]; artifact_required: string[] } {
  const required = Array.isArray(schema?.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
  const slots = new Set(Object.keys(artifactSlots ?? {}));
  return {
    payload_required: required.filter((name) => !slots.has(name)),
    artifact_required: required.filter((name) => slots.has(name)),
  };
}

export function payloadSchemaForContract(
  schema: Record<string, unknown> | undefined,
  artifactRequired: readonly string[],
): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  const artifactNames = new Set(artifactRequired);
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name) => typeof name === "string" && !artifactNames.has(name))
    : undefined;
  return {
    ...schema,
    ...(required ? { required } : {}),
  };
}

function createValidator() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: true,
    loadSchema: undefined,
  });
  addFormats(ajv, { formats: [...APPROVED_JSON_SCHEMA_FORMATS], keywords: false });
  return ajv;
}

function hasRemoteRef(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRemoteRef);
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === "$ref" &&
      typeof nested === "string" &&
      (/^[a-z][a-z0-9+.-]*:/i.test(nested) || nested.startsWith("//"))
    ) {
      return true;
    }
    if (hasRemoteRef(nested)) return true;
  }
  return false;
}

export function assertSupportedPayloadSchema(schema: Record<string, unknown>): void {
  if (hasRemoteRef(schema)) {
    throw new Error("Remote $ref is not allowed in step branch schemas");
  }
  createValidator().compile(schema);
}

function normalizeAjvError(error: ErrorObject): ContractValidationError {
  let path = error.instancePath || "";
  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty?: string }).missingProperty;
    if (missing) path = `${path}/${escapeJsonPointer(missing)}`;
  }
  return {
    source: "payload",
    path,
    rule: error.keyword,
    message: error.message ?? "Payload does not match the branch schema",
  };
}

function filesForSlot(
  files: BranchValidationInput["files"],
  slot: string,
): ArtifactFileMetadata[] {
  const value = files?.[slot];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extensionOf(filename: string): string {
  const safe = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = safe.lastIndexOf(".");
  return dot >= 0 ? safe.slice(dot).toLowerCase() : "";
}

function artifactError(slot: string, rule: string, message: string, index?: number): ContractValidationError {
  const suffix = index === undefined ? "" : `/${index}`;
  return {
    source: "artifact",
    path: `/files/${escapeJsonPointer(slot)}${suffix}`,
    rule,
    message,
  };
}

export function validateBranchContract(
  contract: BranchValidationContract,
  input: BranchValidationInput,
): { ok: true } | ({ ok: false } & ContractValidationFailure) {
  const errors: ContractValidationError[] = [];
  const partition = partitionRequiredFields(contract.schema, contract.artifact_slots);
  const payloadRequired = contract.payload_required ?? partition.payload_required;
  const artifactRequired = contract.artifact_required ?? partition.artifact_required;
  const schema = payloadSchemaForContract(contract.schema, artifactRequired);

  if (schema) {
    try {
      assertSupportedPayloadSchema(schema);
      const validate = createValidator().compile(schema);
      if (!validate(input.payload ?? {})) {
        errors.push(...(validate.errors ?? []).map(normalizeAjvError));
      }
    } catch (error) {
      errors.push({
        source: "payload",
        path: "",
        rule: "schema",
        message: error instanceof Error ? error.message : "Payload schema is invalid",
      });
    }
  } else {
    for (const name of payloadRequired) {
      if ((input.payload ?? {})[name] === undefined) {
        errors.push({
          source: "payload",
          path: `/${escapeJsonPointer(name)}`,
          rule: "required",
          message: `must have required property '${name}'`,
        });
      }
    }
  }

  const slots = contract.artifact_slots ?? {};
  for (const supplied of Object.keys(input.files ?? {})) {
    if (!slots[supplied]) {
      errors.push(artifactError(supplied, "unknown_slot", `Unknown artifact slot '${supplied}'`));
    }
  }

  for (const [slot, definition] of Object.entries(slots)) {
    const files = filesForSlot(input.files, slot);
    const required = artifactRequired.includes(slot);
    const minFiles = Math.max(definition.min_files ?? 0, required ? 1 : 0);
    const maxFiles = definition.max_files ?? 1;
    if (files.length < minFiles) {
      errors.push(artifactError(slot, "min_files", `Artifact slot '${slot}' requires at least ${minFiles} file(s)`));
    }
    if (files.length > maxFiles) {
      errors.push(artifactError(slot, "max_files", `Artifact slot '${slot}' accepts at most ${maxFiles} file(s)`));
    }

    const names = new Set<string>();
    let total = 0;
    files.forEach((file, index) => {
      const normalizedName = file.name.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
      if (!normalizedName || normalizedName === "." || normalizedName === "..") {
        errors.push(artifactError(slot, "filename", "Artifact filename is invalid", index));
      } else if (names.has(normalizedName)) {
        errors.push(artifactError(slot, "unique_filename", `Duplicate artifact filename '${file.name}'`, index));
      }
      names.add(normalizedName);
      total += file.size_bytes;
      if (definition.min_bytes !== undefined && file.size_bytes < definition.min_bytes) {
        errors.push(artifactError(slot, "min_bytes", `Artifact '${file.name}' is smaller than ${definition.min_bytes} bytes`, index));
      }
      if (definition.max_bytes !== undefined && file.size_bytes > definition.max_bytes) {
        errors.push(artifactError(slot, "max_bytes", `Artifact '${file.name}' exceeds ${definition.max_bytes} bytes`, index));
      }
      if (definition.media_types?.length && !definition.media_types.includes(file.media_type.toLowerCase())) {
        errors.push(artifactError(slot, "media_type", `Artifact '${file.name}' has unsupported media type '${file.media_type}'`, index));
      }
      if (
        definition.extensions?.length &&
        !definition.extensions.map((ext) => ext.toLowerCase()).includes(extensionOf(file.name))
      ) {
        errors.push(artifactError(slot, "extension", `Artifact '${file.name}' has an unsupported extension`, index));
      }
    });
    if (definition.max_total_bytes !== undefined && total > definition.max_total_bytes) {
      errors.push(artifactError(slot, "max_total_bytes", `Artifact slot '${slot}' exceeds ${definition.max_total_bytes} total bytes`));
    }
  }

  return errors.length > 0
    ? { ok: false, code: "CONTRACT_VALIDATION_FAILED", errors }
    : { ok: true };
}
