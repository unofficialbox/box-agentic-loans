import 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'box-agent-chat': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        heading?: string;
        'agent-name'?: string;
        placeholder?: string;
        token?: string | null;
      };
    }
  }
}
