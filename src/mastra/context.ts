import { RuntimeContext } from "@mastra/core/di";

type VocabRuntimeContext = {
  requestId: string;
};

export function buildToolExecCtx(mastra: any, extras?: Partial<{requestId:string, spanName:string}>){
  const runtimeContext = new RuntimeContext<VocabRuntimeContext>();
  runtimeContext.set("requestId", extras?.requestId ?? `cmd_${Date.now()}`);
  const tracingContext = mastra?.getTracing?.() ? mastra.getTracing().current?.() ?? {} : {};
  return { runtimeContext, tracingContext };
}