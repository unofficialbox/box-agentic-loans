/// <reference types="vite/client" />

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'box-agent-chat': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<HTMLElement>;
        heading?: string;
        'agent-name'?: string;
        placeholder?: string;
        token?: string;
      };
    }
  }
}

export {};
