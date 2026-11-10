import { assertJsonByteLimit, assertModelInputParts, type ModelInputPart } from "@mininglamp-oss/octo-runtime-client/protocol";

/** 宿主业务材料：名称只用于本轮覆盖，parts 是普通模型输入，不携带执行配置。 */
export interface BusinessMaterial {
  name: string;
  parts: ModelInputPart[];
}

/** 先限制外部对象遍历，再验证 parts；禁止 getter/toJSON 和循环引用。 */
export function assertMaterials(value: unknown): asserts value is BusinessMaterial[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error("IM_MATERIAL_RESULT_INVALID");
  let budget = 8 * 1024 * 1024;
  const ancestors = new Set<object>();
  const visit = (entry: unknown, depth: number): void => {
    if (depth > 32 || --budget < 0) throw new Error("IM_MATERIAL_RESULT_TOO_LARGE");
    if (entry === null || typeof entry === "boolean") return;
    if (typeof entry === "string") { budget -= entry.length; if (budget < 0) throw new Error("IM_MATERIAL_RESULT_TOO_LARGE"); return; }
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (!entry || typeof entry !== "object" || ancestors.has(entry) ||
      (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype)) throw new Error("IM_MATERIAL_RESULT_INVALID");
    if (Array.isArray(entry) && entry.length > budget) throw new Error("IM_MATERIAL_RESULT_TOO_LARGE");
    const toJSON = Object.getOwnPropertyDescriptor(entry, "toJSON");
    if (toJSON && (!Object.hasOwn(toJSON, "value") || typeof toJSON.value === "function")) throw new Error("IM_MATERIAL_RESULT_INVALID");
    ancestors.add(entry);
    for (const key in entry) {
      if (!Object.hasOwn(entry, key)) continue;
      budget -= key.length;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key)!;
      if (!Object.hasOwn(descriptor, "value")) throw new Error("IM_MATERIAL_RESULT_INVALID");
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(entry);
  };
  visit(value, 0);
  const names = new Set<string>();
  for (const material of value) {
    if (!material || typeof material !== "object" || Array.isArray(material) ||
      Object.keys(material).some((key) => !["name", "parts"].includes(key)) ||
      typeof material.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(material.name) || names.has(material.name))
      throw new Error("IM_MATERIAL_RESULT_INVALID");
    names.add(material.name);
    assertModelInputParts(material.parts);
  }
  assertJsonByteLimit(value, 8 * 1024 * 1024, "IM_MATERIAL_RESULT_TOO_LARGE");
  if (value.length) assertModelInputParts(value.flatMap((material) => material.parts));
}

/** 保留文本/图片顺序，名称只产生普通注释边界，不授予控制权限。 */
export function materialParts(materials: readonly BusinessMaterial[]): ModelInputPart[] {
  assertMaterials(materials);
  return materials.flatMap((material) => [
    { type: "text" as const, text: `<!-- Business material: ${material.name} -->` },
    ...structuredClone(material.parts),
  ]);
}
