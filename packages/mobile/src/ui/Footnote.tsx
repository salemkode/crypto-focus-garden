import { Text } from 'react-native';

/**
 * A standalone footnote under a group or button: the same size, color and 16 inset as a Group
 * footer, for text that cannot be a group's footer. At most one per group.
 */
export function Footnote({ children }: { children: string }) {
  return <Text className="px-4 text-footnote text-ink-2">{children}</Text>;
}
