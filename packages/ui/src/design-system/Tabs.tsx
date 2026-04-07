import {
  Box,
  stringWidth,
  TerminalSizeContext,
  Text,
  useInput,
} from "@claude-code-kit/ink-renderer";
import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";
import type { Theme } from "./ThemeProvider";

type TabsProps = {
  children: Array<React.ReactElement<TabProps>>;
  title?: string;
  color?: keyof Theme;
  defaultTab?: string;
  hidden?: boolean;
  useFullWidth?: boolean;
  selectedTab?: string;
  onTabChange?: (tabId: string) => void;
  banner?: React.ReactNode;
  disableNavigation?: boolean;
};

type TabsContextValue = {
  selectedTab: string | undefined;
  width: number | undefined;
};

const TabsContext = createContext<TabsContextValue>({
  selectedTab: undefined,
  width: undefined,
});

export function Tabs({
  title,
  color,
  defaultTab,
  children,
  hidden,
  useFullWidth,
  selectedTab: controlledSelectedTab,
  onTabChange,
  banner,
  disableNavigation,
}: TabsProps): React.ReactNode {
  const terminalSize = useContext(TerminalSizeContext);
  const terminalWidth = terminalSize?.columns ?? 80;

  const tabs = children.map((child) => [child.props.id ?? child.props.title, child.props.title]);

  const defaultTabIndex = defaultTab ? tabs.findIndex((tab) => defaultTab === tab[0]) : 0;
  const isControlled = controlledSelectedTab !== undefined;
  const [internalSelectedTab, setInternalSelectedTab] = useState(
    defaultTabIndex !== -1 ? defaultTabIndex : 0,
  );
  const controlledTabIndex = isControlled
    ? tabs.findIndex((tab) => tab[0] === controlledSelectedTab)
    : -1;
  const selectedTabIndex = isControlled
    ? controlledTabIndex !== -1
      ? controlledTabIndex
      : 0
    : internalSelectedTab;

  const handleTabChange = useCallback(
    (offset: number) => {
      const newIndex = (selectedTabIndex + tabs.length + offset) % tabs.length;
      const newTabId = tabs[newIndex]?.[0];
      if (isControlled && onTabChange && newTabId) {
        onTabChange(newTabId);
      } else {
        setInternalSelectedTab(newIndex);
      }
    },
    [selectedTabIndex, tabs, isControlled, onTabChange],
  );

  useInput(
    useCallback(
      (
        _input: string,
        key: { tab?: boolean; leftArrow?: boolean; rightArrow?: boolean; shift?: boolean },
      ) => {
        if (hidden || disableNavigation) return;
        if (key.tab && !key.shift) {
          handleTabChange(1);
        } else if (key.tab && key.shift) {
          handleTabChange(-1);
        } else if (key.leftArrow) {
          handleTabChange(-1);
        } else if (key.rightArrow) {
          handleTabChange(1);
        }
      },
      [hidden, disableNavigation, handleTabChange],
    ),
  );

  const titleWidth = title ? stringWidth(title) + 1 : 0;
  const tabsWidth = tabs.reduce(
    (sum, [, tabTitle]) => sum + (tabTitle ? stringWidth(tabTitle) : 0) + 3,
    0,
  );
  const usedWidth = titleWidth + tabsWidth;
  const spacerWidth = useFullWidth ? Math.max(0, terminalWidth - usedWidth) : 0;
  const contentWidth = useFullWidth ? terminalWidth : undefined;

  return (
    <TabsContext.Provider
      value={{
        selectedTab: tabs[selectedTabIndex]?.[0],
        width: contentWidth,
      }}
    >
      <Box flexDirection="column">
        {!hidden && (
          <Box flexDirection="row" gap={1}>
            {title !== undefined && (
              <Text bold={true} color={color}>
                {title}
              </Text>
            )}
            {tabs.map(([id, tabTitle], i) => {
              const isCurrent = selectedTabIndex === i;
              return (
                <Text key={id} inverse={isCurrent} bold={isCurrent}>
                  {" "}
                  {tabTitle}{" "}
                </Text>
              );
            })}
            {spacerWidth > 0 && <Text>{" ".repeat(spacerWidth)}</Text>}
          </Box>
        )}
        {banner}
        <Box width={contentWidth} marginTop={hidden ? 0 : 1}>
          {children}
        </Box>
      </Box>
    </TabsContext.Provider>
  );
}

type TabProps = {
  title: string;
  id?: string;
  children: React.ReactNode;
};

export function Tab({ title, id, children }: TabProps): React.ReactNode {
  const { selectedTab, width } = useContext(TabsContext);
  if (selectedTab !== (id ?? title)) {
    return null;
  }
  return <Box width={width}>{children}</Box>;
}

export function useTabsWidth() {
  const { width } = useContext(TabsContext);
  return width;
}
