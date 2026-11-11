import type { ContextItem } from "@mininglamp-oss/octo-runtime-client/protocol";
import type { ImContextBuildScope } from "./scope.js";
import { resourceContext, RESOURCE_GUIDANCE } from "../resources.js";

/** extra.im/resources：本条消息的附件、文档或网盘地址；不预读资源正文。 */
export function buildResourcesContext(scope: ImContextBuildScope): ContextItem | undefined {
  const resources = resourceContext(scope.message);
  if (!resources) return undefined;
  return {
    namespace: "extra.im",
    name: "resources",
    payload: { source: scope.source, ...resources, guidance: RESOURCE_GUIDANCE },
  };
}
