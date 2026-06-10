import { avatarColor, cn, initials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
};

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-semibold text-white shrink-0 ring-2 ring-white',
        avatarColor(name),
        sizes[size],
        className,
      )}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

interface AvatarGroupProps {
  names: string[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}

export function AvatarGroup({ names, max = 4, size = 'sm' }: AvatarGroupProps) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((n, i) => (
        <Avatar key={i} name={n} size={size} />
      ))}
      {extra > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-ink-200 text-ink-600 font-semibold ring-2 ring-white',
            sizes[size],
          )}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
