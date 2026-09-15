import { useNavigate } from 'react-router-dom';
import { SearchItem } from './searchIndex';

interface CommandResultProps {
  item: SearchItem;
  onNavigate: () => void;
}

export function CommandResult({ item, onNavigate }: CommandResultProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (item.href) {
      navigate(item.href);
    }
    onNavigate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-medium">{item.title}</span>
      {item.subtitle && <span className="text-xs text-muted-foreground">{item.subtitle}</span>}
    </button>
  );
}
