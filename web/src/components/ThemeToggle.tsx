import { useTheme } from '../lib/theme';

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={compact ? 'icon-button' : 'secondary-button theme-toggle'}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
      {!compact ? (theme === 'dark' ? ' Light' : ' Dark') : null}
    </button>
  );
}
