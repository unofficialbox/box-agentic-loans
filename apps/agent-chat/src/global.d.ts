import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { AgentChat } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { RunTrace } from "@unofficialbox/box-open-elements";

type ElementProps<T> = DetailedHTMLProps<HTMLAttributes<T>, T>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "box-agent-chat": ElementProps<AgentChat> & {
        heading?: string;
        "agent-name"?: string;
        placeholder?: string;
        token?: string;
      };
      "box-run-trace": ElementProps<RunTrace> & { heading?: string };
    }
  }
}
