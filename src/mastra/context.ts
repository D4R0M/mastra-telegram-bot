import { RuntimeContext } from "@mastra/core/di";

type VocabRuntimeContext = {
  requestId: string;
};

export function buildToolExecCtx(
  mastra: any,
  extras?: Partial<{ requestId: string | number; spanName: string }>,
) {
  const runtimeContext = new RuntimeContext<VocabRuntimeContext>();
  const requestId =
    extras?.requestId !== undefined ? String(extras.requestId) : `cmd_${Date.now()}`;
  runtimeContext.set("requestId", requestId);
  const tracingContext = mastra?.getTracing?.() ? mastra.getTracing().current?.() ?? {} : {};
  return { runtimeContext, tracingContext };
}