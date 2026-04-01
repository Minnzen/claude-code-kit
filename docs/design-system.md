# Design System Components

Higher-level UI components for building polished terminal interfaces. These components support theming via ThemeProvider.

---

## ThemeProvider

Wraps your app to provide theme context. All design-system components that accept a `color` prop resolve theme keys through this context.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | — | App content |
| `initialState` | `ThemeSetting` | `'dark'` | Initial theme: `'dark'`, `'light'`, or `'auto'` |
| `onThemeSave` | `(setting: ThemeSetting) => void` | — | Called when the user saves a theme change |

### Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTheme()` | `[ThemeName, (setting: ThemeSetting) => void]` | Current resolved theme name and setter |
| `useThemeSetting()` | `ThemeSetting` | The raw setting (`'dark'`, `'light'`, or `'auto'`) |
| `usePreviewTheme()` | `{ setPreviewTheme, savePreview, cancelPreview }` | Preview a theme without saving it |

### Theme tokens

| Token | Dark | Light |
|-------|------|-------|
| `text` | `#E0E0E0` | `#1E1E1E` |
| `dimText` | `#666666` | `#999999` |
| `border` | `#444444` | `#CCCCCC` |
| `accent` | `#5B9BD5` | `#0066CC` |
| `success` | `#6BC76B` | `#2E7D32` |
| `warning` | `#E5C07B` | `#F57C00` |
| `error` | `#E06C75` | `#C62828` |
| `assistant` | `#DA7756` | `#DA7756` |
| `inactive` | `#666666` | `#999999` |
| `inverseText` | `#1E1E1E` | `#FFFFFF` |
| `permission` | `#5B9BD5` | `#0066CC` |

### Example

```tsx
<ThemeProvider initialState="dark" onThemeSave={(s) => persist(s)}>
  <App />
</ThemeProvider>
```

---

## Dialog

A dialog box with a title, optional subtitle, body content, and keyboard shortcut hints. Pressing Esc calls `onCancel`.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `React.ReactNode` | — | Dialog title (rendered bold in the accent color) |
| `subtitle` | `React.ReactNode` | — | Optional subtitle shown below the title (dimmed) |
| `children` | `React.ReactNode` | — | Dialog body content |
| `onCancel` | `() => void` | — | Called when Esc is pressed |
| `color` | `keyof Theme` | `'permission'` | Theme color key for title and border |
| `hideInputGuide` | `boolean` | — | Hides the default "Enter to confirm · Esc to cancel" hint |
| `hideBorder` | `boolean` | — | Renders content without the surrounding `Pane` border |

### Example

```tsx
<Dialog
  title="Delete file?"
  subtitle="This cannot be undone."
  onCancel={() => setOpen(false)}
  color="error"
>
  <Text>Are you sure you want to delete config.json?</Text>
</Dialog>
```

---

## Tabs / Tab

A tabbed interface with keyboard navigation. Tabs can be controlled or uncontrolled.

### Tabs Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `Array<React.ReactElement<TabProps>>` | — | `<Tab>` elements |
| `title` | `string` | — | Label displayed before the tab strip |
| `color` | `keyof Theme` | — | Theme color key for the title |
| `defaultTab` | `string` | first tab | Tab id to select initially (uncontrolled) |
| `hidden` | `boolean` | — | Hides the tab bar (content still renders) |
| `useFullWidth` | `boolean` | — | Stretches the tab bar to the full terminal width |
| `selectedTab` | `string` | — | Controlled selected tab id |
| `onTabChange` | `(tabId: string) => void` | — | Called when the selected tab changes (controlled mode) |
| `banner` | `React.ReactNode` | — | Content rendered between the tab bar and tab content |
| `disableNavigation` | `boolean` | — | Disables Tab/arrow key navigation |

### Tab Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | Tab label shown in the tab bar |
| `id` | `string` | `title` | Unique tab identifier; defaults to `title` if omitted |
| `children` | `React.ReactNode` | — | Content shown when this tab is active |

### Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTabsWidth()` | `number \| undefined` | Width of the tab content area (set when `useFullWidth` is true) |

### Example

```tsx
<Tabs title="Output" color="accent" defaultTab="logs">
  <Tab title="Logs" id="logs">
    <LogView />
  </Tab>
  <Tab title="Errors" id="errors">
    <ErrorView />
  </Tab>
</Tabs>
```

---

## FuzzyPicker

A full-featured fuzzy search picker with keyboard navigation, preview pane support, and configurable actions.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | — | Picker title displayed at the top |
| `placeholder` | `string` | `'Type to search...'` | Search input placeholder |
| `initialQuery` | `string` | `''` | Pre-filled search query |
| `items` | `readonly T[]` | — | The filtered list of items to display |
| `getKey` | `(item: T) => string` | — | Returns a unique key string for an item |
| `renderItem` | `(item: T, isFocused: boolean) => React.ReactNode` | — | Renders a single list row |
| `renderPreview` | `(item: T) => React.ReactNode` | — | Optional preview pane renderer |
| `previewPosition` | `'bottom' \| 'right'` | `'bottom'` | Where to render the preview pane |
| `visibleCount` | `number` | `8` | Max number of items visible at once |
| `direction` | `'down' \| 'up'` | `'down'` | List scroll direction |
| `onQueryChange` | `(query: string) => void` | — | Called on every keystroke with the current query |
| `onSelect` | `(item: T) => void` | — | Called when Enter is pressed on a focused item |
| `onTab` | `{ action: string; handler: (item: T) => void }` | — | Optional Tab key action |
| `onShiftTab` | `{ action: string; handler: (item: T) => void }` | — | Optional Shift+Tab key action |
| `onFocus` | `(item: T \| undefined) => void` | — | Called when the focused item changes |
| `onCancel` | `() => void` | — | Called when Esc is pressed |
| `emptyMessage` | `string \| ((query: string) => string)` | `'No results'` | Message shown when the list is empty |
| `matchLabel` | `string` | — | Optional label shown below the list (e.g. match count) |
| `selectAction` | `string` | `'select'` | Label for the Enter hint (e.g. `'open'`) |
| `extraHints` | `React.ReactNode` | — | Additional keyboard hints appended to the hint bar |

### Example

```tsx
<FuzzyPicker
  title="Open file"
  items={filteredFiles}
  getKey={(f) => f.path}
  renderItem={(f, focused) => <Text color={focused ? 'accent' : undefined}>{f.name}</Text>}
  onQueryChange={setQuery}
  onSelect={(f) => openFile(f.path)}
  onCancel={() => setOpen(false)}
/>
```

---

## ListItem

A list row component for selection UIs (menus, dropdowns, multi-selects). Handles focus pointer, selection checkmark, scroll indicators, and color states.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isFocused` | `boolean` | — | Shows the pointer indicator (❯) and focus color |
| `isSelected` | `boolean` | `false` | Shows the checkmark indicator (✓) |
| `children` | `ReactNode` | — | Row content |
| `description` | `string` | — | Secondary text displayed below the main content |
| `showScrollDown` | `boolean` | — | Shows a ↓ scroll hint instead of the pointer |
| `showScrollUp` | `boolean` | — | Shows a ↑ scroll hint instead of the pointer |
| `styled` | `boolean` | `true` | When `true`, wraps children in themed Text; when `false`, renders children as-is |
| `disabled` | `boolean` | `false` | Dims the item and hides indicators |
| `declareCursor` | `boolean` | `true` | Set `false` when a child declares its own terminal cursor |

### Example

```tsx
{options.map((opt, i) => (
  <ListItem
    key={opt.id}
    isFocused={focusIndex === i}
    isSelected={selected === opt.id}
  >
    {opt.label}
  </ListItem>
))}
```

---

## LoadingState

A spinner paired with a loading message for async operations.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string` | — | Loading message displayed next to the spinner |
| `bold` | `boolean` | `false` | Renders the message in bold |
| `dimColor` | `boolean` | `false` | Renders the message in dimmed color |
| `subtitle` | `string` | — | Optional secondary text displayed below the message |

### Example

```tsx
<LoadingState message="Loading sessions" bold subtitle="Fetching your Claude Code sessions..." />
```

---

## Pane

A content region bounded by a colored top divider line with horizontal padding. Used as the outer shell for slash-command screens.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | — | Pane content |
| `color` | `keyof Theme` | — | Theme color key for the top divider line |

### Example

```tsx
<Pane color="accent">
  <Text bold>Results</Text>
  <ResultList />
</Pane>
```

---

## ThemedBox

A drop-in replacement for Ink's `Box` that accepts theme color keys (e.g. `'accent'`, `'error'`) for border and background colors, resolving them through the active theme.

### Props

Accepts all `Box` layout props plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `borderColor` | `keyof Theme \| Color` | — | Theme key or raw color string for all borders |
| `borderTopColor` | `keyof Theme \| Color` | — | Top border color |
| `borderBottomColor` | `keyof Theme \| Color` | — | Bottom border color |
| `borderLeftColor` | `keyof Theme \| Color` | — | Left border color |
| `borderRightColor` | `keyof Theme \| Color` | — | Right border color |
| `backgroundColor` | `keyof Theme \| Color` | — | Background color |
| `ref` | `Ref<DOMElement>` | — | Ref forwarded to the underlying DOM element |
| `tabIndex` | `number` | — | Focus tab index |
| `autoFocus` | `boolean` | — | Auto-focus on mount |
| `onClick` | `(event: ClickEvent) => void` | — | Click handler |
| `onFocus` | `(event: FocusEvent) => void` | — | Focus handler |
| `onBlur` | `(event: FocusEvent) => void` | — | Blur handler |
| `onKeyDown` | `(event: KeyboardEvent) => void` | — | Key down handler |
| `onMouseEnter` | `() => void` | — | Mouse enter handler |
| `onMouseLeave` | `() => void` | — | Mouse leave handler |

Raw color strings (`#rrggbb`, `rgb(...)`, `ansi256(...)`, `ansi:...`) bypass theme lookup and are passed through directly.

### Example

```tsx
<ThemedBox borderStyle="round" borderColor="accent" paddingX={1}>
  <Text>Content with themed border</Text>
</ThemedBox>
```

---

## ThemedText

A drop-in replacement for Ink's `Text` that accepts theme color keys for `color` and `backgroundColor`, resolving them through the active theme. Also participates in the `TextHoverColorContext` for contextual hover coloring.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `keyof Theme \| Color` | — | Text foreground color (theme key or raw color string) |
| `backgroundColor` | `keyof Theme` | — | Text background color (theme key only) |
| `dimColor` | `boolean` | `false` | Dims the text using the `inactive` theme color |
| `bold` | `boolean` | `false` | Bold text |
| `italic` | `boolean` | `false` | Italic text |
| `underline` | `boolean` | `false` | Underlined text |
| `strikethrough` | `boolean` | `false` | Strikethrough text |
| `inverse` | `boolean` | `false` | Inverts foreground and background |
| `wrap` | `Styles['textWrap']` | `'wrap'` | Text wrap behavior |
| `children` | `ReactNode` | — | Text content |

Color precedence: explicit `color` > `TextHoverColorContext` > `dimColor` (renders as `inactive`).

### Example

```tsx
<ThemedText color="success" bold>Operation complete</ThemedText>
<ThemedText dimColor>Secondary info</ThemedText>
```

---

## Byline

Joins children with a middot separator (`·`) for inline metadata display. Automatically filters out `null`, `undefined`, and `false` children, rendering separators only between valid elements.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | — | Items to join with `·` separators |

### Example

```tsx
<Text dimColor>
  <Byline>
    <KeyboardShortcutHint shortcut="Enter" action="confirm" />
    <KeyboardShortcutHint shortcut="Esc" action="cancel" />
    {showExtra && <KeyboardShortcutHint shortcut="Tab" action="next" />}
  </Byline>
</Text>
```

---

## KeyboardShortcutHint

Renders a single keyboard shortcut hint in the format `"shortcut to action"` or `"(shortcut to action)"`. Typically used inside `Byline` and wrapped in `<Text dimColor>`.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `shortcut` | `string` | — | The key or chord to display (e.g., `"ctrl+o"`, `"Enter"`, `"↑/↓"`) |
| `action` | `string` | — | The action the key performs (e.g., `"expand"`, `"select"`) |
| `parens` | `boolean` | `false` | Wraps the hint in parentheses |
| `bold` | `boolean` | `false` | Renders the shortcut text in bold |

### Example

```tsx
<Text dimColor>
  <Byline>
    <KeyboardShortcutHint shortcut="Enter" action="confirm" bold />
    <KeyboardShortcutHint shortcut="Esc" action="cancel" />
    <KeyboardShortcutHint shortcut="ctrl+o" action="expand" parens />
  </Byline>
</Text>
```

---

## Ratchet

Prevents layout collapse when content shrinks — once the component reaches a maximum height, it maintains that height as a minimum. Useful for streaming output or animated content that would otherwise cause jarring layout shifts.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | — | Content to stabilize |
| `lock` | `'always' \| 'offscreen'` | `'always'` | `'always'`: always hold the max height; `'offscreen'`: only hold max height when the component is scrolled out of the terminal viewport |

### Example

```tsx
<Ratchet lock="offscreen">
  <StreamingOutput lines={lines} />
</Ratchet>
```

---

## color (utility)

A curried, theme-aware colorize function for use outside of React (e.g., in plain string rendering).

### Signature

```ts
function color(
  c: keyof Theme | Color | undefined,
  theme: ThemeName,
  type?: ColorType,  // 'foreground' | 'background', default 'foreground'
): (text: string) => string
```

Resolves theme keys to raw hex values before delegating to the ink renderer's `colorize`. Raw color strings (`#rrggbb`, `rgb(...)`, `ansi256(...)`, `ansi:...`) bypass theme lookup.

### Example

```ts
const highlight = color('accent', 'dark')
console.log(highlight('Hello'))  // prints "Hello" in the accent color

const errorFg = color('error', 'light', 'foreground')
const line = errorFg('Something went wrong')
```
